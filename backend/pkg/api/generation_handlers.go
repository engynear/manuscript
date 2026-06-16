package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

type generationRequest struct {
	Markdown string             `json:"markdown"`
	Settings generationSettings `json:"settings"`
}

type generationSettings struct {
	ImageLimit   int    `json:"imageLimit"`
	ChapterStart string `json:"chapterStart"`
	Paper        string `json:"paper"`
	Ornament     string `json:"ornament"`
	Divider      string `json:"divider"`
	TitleDivider string `json:"titleDivider"`
	Dropcap      string `json:"dropcap"`
	FontStyle    string `json:"fontStyle"`
	FontSize     int    `json:"fontSize"`
}

type generationProgress struct {
	Type     string                 `json:"type"`
	Step     string                 `json:"step,omitempty"`
	Message  string                 `json:"message,omitempty"`
	Progress int                    `json:"progress,omitempty"`
	Result   *generationResult      `json:"result,omitempty"`
	Detail   map[string]interface{} `json:"detail,omitempty"`
}

type generationResult struct {
	Hash          string `json:"hash"`
	Title         string `json:"title"`
	Subtitle      string `json:"subtitle,omitempty"`
	PreviewHTML   string `json:"previewHtml"`
	PDFURL        string `json:"pdfUrl"`
	ImageFailures int    `json:"imageFailures"`
}

type manuscriptPlan struct {
	Title    string          `json:"title"`
	Subtitle string          `json:"subtitle"`
	Sections []planSection   `json:"sections"`
}

type planSection struct {
	ID              string        `json:"id"`
	OriginalHeading string        `json:"originalHeading"`
	DisplayHeading  string        `json:"displayHeading"`
	Level           int           `json:"level,omitempty"`
	BodyMarkdown    string        `json:"bodyMarkdown"`
	DropCap         bool          `json:"dropCap"`
	Ornament        bool          `json:"ornament"`
	Illustration    *illustration `json:"illustration"`
}

type illustration struct {
	Type    string `json:"type"`
	Prompt  string `json:"prompt"`
	Caption string `json:"caption"`
}

type generatedImage struct {
	SectionID string
	URL       string
	FilePath  string
	Caption   string
	Failed    bool
}

type manuscriptBlock struct {
	HTML            string
	Units           float64
	KeepWithNext    bool
	NewPageBefore   bool
	FitSectionUnits float64
	Kind            string
}

type markdownBlock struct {
	Kind string
	Text string
}

var (
	nonSlugChars     = regexp.MustCompile(`[^a-z0-9]+`)
	markdownRule     = regexp.MustCompile(`^(-{3,}|\*{3,}|_{3,})$`)
	markdownStrong   = regexp.MustCompile(`\*\*([^*]+)\*\*`)
	markdownEmphasis = regexp.MustCompile(`\*([^*]+)\*`)
	markdownMarker   = regexp.MustCompile(`[*_` + "`" + `]+`)
	markdownHeading  = regexp.MustCompile(`^(#{1,6})\s+(.+)$`)
	shortWordBreak   = regexp.MustCompile(`(^|[\s(«"“])([A-Za-zА-Яа-яЁё]{1,2})\s+([A-Za-zА-Яа-яЁё])`)
)

const generationCacheVersion = "v7"

const (
	pageUnits             = 102.0
	firstPageUnits        = 92.0
	minNextPageUnits      = 14.0
	newSectionStartUnits  = 34.0
	defaultSectionHeading = 2
)

func (s *Server) handleGenerateManuscript(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireUser(w, r); !ok {
		return
	}

	var req generationRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Markdown = strings.TrimSpace(req.Markdown)
	if req.Markdown == "" {
		writeError(w, http.StatusBadRequest, "markdown is required")
		return
	}
	if req.Settings.ImageLimit < 0 {
		req.Settings.ImageLimit = 0
	}
	if req.Settings.ImageLimit > 8 {
		req.Settings.ImageLimit = 8
	}
	if req.Settings.FontSize < 16 || req.Settings.FontSize > 24 {
		req.Settings.FontSize = 20
	}

	w.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher, _ := w.(http.Flusher)
	send := func(payload generationProgress) {
		_ = json.NewEncoder(w).Encode(payload)
		if flusher != nil {
			flusher.Flush()
		}
	}

	ctx := r.Context()
	send(generationProgress{Type: "progress", Step: "normalize", Message: "Parsing Markdown", Progress: 8})

	hash := contentHash(req.Markdown, req.Settings)
	sourceHash := sourceContentHash(req.Markdown)
	jobDir := filepath.Join(s.cfg.MediaDir, "generated", hash)
	sourceDir := filepath.Join(s.cfg.MediaDir, "generated", sourceHash)
	imageDir := filepath.Join(sourceDir, "images")
	if err := os.MkdirAll(jobDir, 0o755); err != nil {
		send(generationProgress{Type: "error", Message: "could not prepare output directory"})
		return
	}
	if err := os.MkdirAll(imageDir, 0o755); err != nil {
		send(generationProgress{Type: "error", Message: "could not prepare output directory"})
		return
	}

	send(generationProgress{Type: "progress", Step: "plan", Message: "Preparing manuscript plan", Progress: 18})
	planPath := filepath.Join(sourceDir, "plan.json")
	plan, cachedPlan, err := readCachedPlan(planPath)
	if err == nil && cachedPlan {
		send(generationProgress{Type: "progress", Step: "plan-cache", Message: "Manuscript plan loaded from cache", Progress: 26})
	} else {
		plan, err = s.generatePlan(ctx, req.Markdown, req.Settings.ImageLimit)
		if err != nil {
			send(generationProgress{Type: "progress", Step: "plan-fallback", Message: "Using local plan fallback", Progress: 24})
			plan = localPlan(req.Markdown, req.Settings.ImageLimit)
		} else {
			send(generationProgress{Type: "progress", Step: "plan-ready", Message: "Manuscript plan ready", Progress: 26})
		}
		if err := writeCachedPlan(planPath, plan); err != nil {
			send(generationProgress{Type: "progress", Step: "plan-cache-skip", Message: "Plan cache could not be written", Progress: 27})
		}
	}
	plan = postProcessPlan(plan)
	plan = ensureIllustrations(plan, req.Settings.ImageLimit)

	sectionsWithImages := imageSections(plan, req.Settings.ImageLimit)
	send(generationProgress{
		Type:     "progress",
		Step:     "images",
		Message:  imageMessage(len(sectionsWithImages)),
		Progress: 30,
	})

	images := map[string]generatedImage{}
	failures := 0
	for i, section := range sectionsWithImages {
		progress := 34
		if len(sectionsWithImages) > 0 {
			progress = 34 + int(float64(i)*30/float64(len(sectionsWithImages)))
		}
		send(generationProgress{
			Type:     "progress",
			Step:     "image-start",
			Message:  fmt.Sprintf("Generating illustration %d/%d", i+1, len(sectionsWithImages)),
			Progress: progress,
			Detail:   map[string]interface{}{"sectionId": section.ID},
		})

		img, fromCache, err := s.generateSectionImage(ctx, sourceHash, imageDir, section)
		if err != nil {
			failures++
			img = generatedImage{
				SectionID: section.ID,
				Caption:   section.Illustration.Caption,
				Failed:    true,
			}
			send(generationProgress{
				Type:     "progress",
				Step:     "image-failed",
				Message:  fmt.Sprintf("Illustration %d/%d failed; using ornament fallback", i+1, len(sectionsWithImages)),
				Progress: progress + 4,
				Detail:   map[string]interface{}{"sectionId": section.ID},
			})
		} else {
			send(generationProgress{
				Type:     "progress",
				Step:     "image-complete",
				Message:  imageDoneMessage(fromCache, i+1, len(sectionsWithImages)),
				Progress: progress + 4,
				Detail:   map[string]interface{}{"sectionId": section.ID},
			})
		}
		images[section.ID] = img
	}

	send(generationProgress{Type: "progress", Step: "html", Message: "Composing styled preview", Progress: 72})
	publicBaseURL := requestBaseURL(r)
	previewHTML := renderPreviewHTML(plan, images, req.Settings, publicBaseURL)
	if err := os.WriteFile(filepath.Join(jobDir, "manuscript.html"), []byte(previewHTML), 0o644); err != nil {
		writeError(w, http.StatusInternalServerError, "could not write manuscript html")
		return
	}

	send(generationProgress{Type: "progress", Step: "pdf", Message: "Printing PDF from preview layout", Progress: 88})
	pdfPath := filepath.Join(jobDir, "manuscript.pdf")
	if _, err := os.Stat(pdfPath); err == nil {
		send(generationProgress{Type: "progress", Step: "pdf-cache", Message: "PDF loaded from cache", Progress: 94})
	} else {
		if err := renderPDF(ctx, pdfPath, previewHTML); err != nil {
			send(generationProgress{Type: "error", Message: "could not create PDF"})
			return
		}
	}

	pdfURL := strings.TrimRight(s.cfg.MediaBaseURL, "/") + "/generated/" + hash + "/manuscript.pdf"
	send(generationProgress{
		Type:     "done",
		Message:  "Manuscript complete",
		Progress: 100,
		Result: &generationResult{
			Hash:          hash,
			Title:         plan.Title,
			Subtitle:      plan.Subtitle,
			PreviewHTML:   previewHTML,
			PDFURL:        pdfURL,
			ImageFailures: failures,
		},
	})
}

func contentHash(markdown string, settings generationSettings) string {
	payload, _ := json.Marshal(struct {
		Version  string             `json:"version"`
		Markdown string             `json:"markdown"`
		Settings generationSettings `json:"settings"`
	}{Version: generationCacheVersion, Markdown: markdown, Settings: settings})
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])[:24]
}

func sourceContentHash(markdown string) string {
	payload, _ := json.Marshal(struct {
		Version  string `json:"version"`
		Markdown string `json:"markdown"`
	}{Version: generationCacheVersion, Markdown: markdown})
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])[:24]
}

func imageMessage(count int) string {
	if count == 0 {
		return "No illustrations requested for this manuscript"
	}
	if count == 1 {
		return "Preparing 1 illustration"
	}
	return fmt.Sprintf("Preparing %d illustrations", count)
}

func imageDoneMessage(fromCache bool, index, total int) string {
	if fromCache {
		return fmt.Sprintf("Illustration %d/%d loaded from cache", index, total)
	}
	return fmt.Sprintf("Illustration %d/%d complete", index, total)
}

func readCachedPlan(path string) (manuscriptPlan, bool, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return manuscriptPlan{}, false, err
	}
	var plan manuscriptPlan
	if err := json.Unmarshal(raw, &plan); err != nil {
		return manuscriptPlan{}, false, err
	}
	if strings.TrimSpace(plan.Title) == "" || len(plan.Sections) == 0 {
		return manuscriptPlan{}, false, fmt.Errorf("cached plan is incomplete")
	}
	return plan, true, nil
}

func writeCachedPlan(path string, plan manuscriptPlan) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(plan, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, raw, 0o644)
}

func (s *Server) generatePlan(ctx context.Context, markdown string, imageLimit int) (manuscriptPlan, error) {
	if strings.TrimSpace(s.cfg.OpenAIKey) == "" {
		return manuscriptPlan{}, fmt.Errorf("OPENAI_API_KEY is not configured")
	}

	sourcePlan := localPlan(markdown, imageLimit)
	type sectionForModel struct {
		ID      string `json:"id"`
		Level   int    `json:"level"`
		Heading string `json:"heading"`
		Excerpt string `json:"excerpt"`
	}
	sections := make([]sectionForModel, 0, len(sourcePlan.Sections))
	for _, section := range sourcePlan.Sections {
		sections = append(sections, sectionForModel{
			ID:      section.ID,
			Level:   sectionLevel(section),
			Heading: section.OriginalHeading,
			Excerpt: truncateText(plainText(section.BodyMarkdown), 650),
		})
	}
	sectionJSON, _ := json.Marshal(sections)

	prompt := fmt.Sprintf(`Create a medieval fantasy manuscript plan for this Markdown-derived section list.
Return only JSON with this shape:
{"title":"...","subtitle":"...","sections":[{"id":"same id","displayHeading":"...","dropCap":true,"ornament":false,"illustration":{"type":"map|coat_of_arms|woodcut_engraving|illuminated_miniature|chapter_vignette|marginalia_scene|botanical_marginalia|bestiary_creature|relic_study|scribal_diagram","prompt":"...","caption":"..."} or null}]}

Rules:
- Preserve all ids exactly.
- Do not rewrite body text; body text is restored server-side.
- Use at most %d illustrations.
- Use concise captions and prompts.
- If image limit is 0, every illustration must be null.

Sections:
%s`, imageLimit, string(sectionJSON))

	body := map[string]interface{}{
		"model": s.cfg.PlanModel,
		"messages": []map[string]string{
			{"role": "system", "content": "You design structured manuscript rendering plans and return valid JSON only."},
			{"role": "user", "content": prompt},
		},
		"response_format": map[string]string{"type": "json_object"},
	}
	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := s.openAIJSON(ctx, "/v1/chat/completions", body, &result); err != nil {
		return manuscriptPlan{}, err
	}
	if len(result.Choices) == 0 || strings.TrimSpace(result.Choices[0].Message.Content) == "" {
		return manuscriptPlan{}, fmt.Errorf("empty plan response")
	}

	var planned manuscriptPlan
	if err := json.Unmarshal([]byte(result.Choices[0].Message.Content), &planned); err != nil {
		return manuscriptPlan{}, err
	}
	return restorePlanBody(sourcePlan, planned), nil
}

func (s *Server) generateSectionImage(ctx context.Context, hash, imageDir string, section planSection) (generatedImage, bool, error) {
	if section.Illustration == nil {
		return generatedImage{}, false, fmt.Errorf("section has no illustration")
	}
	if strings.TrimSpace(s.cfg.OpenAIKey) == "" {
		return generatedImage{}, false, fmt.Errorf("OPENAI_API_KEY is not configured")
	}

	fileName := section.ID + ".png"
	filePath := filepath.Join(imageDir, fileName)
	publicURL := strings.TrimRight(s.cfg.MediaBaseURL, "/") + "/generated/" + hash + "/images/" + fileName

	if _, err := os.Stat(filePath); err == nil {
		return generatedImage{SectionID: section.ID, URL: publicURL, FilePath: filePath, Caption: section.Illustration.Caption}, true, nil
	}

	prompt := section.Illustration.Prompt + "\n\nStyle constraints: " + illustrationStyle(section.Illustration.Type)
	body := map[string]interface{}{
		"model":         s.cfg.ImageModel,
		"prompt":        prompt,
		"size":          imageSize(section.Illustration.Type),
		"background":    "transparent",
		"output_format": "png",
		"quality":       s.cfg.ImageQuality,
	}
	var result struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
			URL     string `json:"url"`
		} `json:"data"`
	}
	if err := s.openAIJSON(ctx, "/v1/images/generations", body, &result); err != nil {
		return generatedImage{}, false, err
	}
	if len(result.Data) == 0 {
		return generatedImage{}, false, fmt.Errorf("empty image response")
	}
	if result.Data[0].B64JSON != "" {
		raw, err := base64.StdEncoding.DecodeString(result.Data[0].B64JSON)
		if err != nil {
			return generatedImage{}, false, err
		}
		if err := os.WriteFile(filePath, raw, 0o644); err != nil {
			return generatedImage{}, false, err
		}
	} else if result.Data[0].URL != "" {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, result.Data[0].URL, nil)
		if err != nil {
			return generatedImage{}, false, err
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return generatedImage{}, false, err
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode > 299 {
			return generatedImage{}, false, fmt.Errorf("image download failed: %s", resp.Status)
		}
		out, err := os.Create(filePath)
		if err != nil {
			return generatedImage{}, false, err
		}
		defer out.Close()
		if _, err := io.Copy(out, resp.Body); err != nil {
			return generatedImage{}, false, err
		}
	} else {
		return generatedImage{}, false, fmt.Errorf("image response did not include data")
	}

	return generatedImage{SectionID: section.ID, URL: publicURL, FilePath: filePath, Caption: section.Illustration.Caption}, false, nil
}

func (s *Server) openAIJSON(ctx context.Context, endpoint string, body interface{}, out interface{}) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	reqCtx, cancel := context.WithTimeout(ctx, 4*time.Minute)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, "https://api.openai.com"+endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.cfg.OpenAIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("openai %s: %s", resp.Status, truncateText(string(raw), 500))
	}
	return json.Unmarshal(raw, out)
}

func localPlan(markdown string, imageLimit int) manuscriptPlan {
	sections := parseMarkdownSections(markdown)
	if len(sections) == 0 {
		sections = []planSection{{
			ID:              "section-1",
			OriginalHeading: "Untitled",
			DisplayHeading:  "Untitled",
			Level:           1,
			BodyMarkdown:    markdown,
			DropCap:         true,
		}}
	}
	title := sections[0].OriginalHeading
	if title == "" {
		title = "Untitled"
	}
	for i := range sections {
		sections[i].DisplayHeading = sections[i].OriginalHeading
		sections[i].DropCap = i == 0
		if i > 0 {
			sections[i].Ornament = true
		}
	}
	return ensureIllustrations(manuscriptPlan{Title: title, Sections: sections}, imageLimit)
}

func parseMarkdownSections(markdown string) []planSection {
	lines := strings.Split(markdown, "\n")
	sections := []planSection{}
	var current *planSection
	body := []string{}
	flush := func() {
		if current == nil {
			return
		}
		current.BodyMarkdown = strings.TrimSpace(strings.Join(body, "\n"))
		sections = append(sections, *current)
		body = []string{}
	}
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if match := markdownHeading.FindStringSubmatch(trimmed); match != nil {
			flush()
			heading := strings.TrimSpace(match[2])
			current = &planSection{
				ID:              uniqueSectionID(sections, heading),
				OriginalHeading: heading,
				DisplayHeading:  heading,
				Level:           len(match[1]),
			}
			continue
		}
		if current == nil && trimmed != "" {
			current = &planSection{ID: "section-1", OriginalHeading: "Untitled", DisplayHeading: "Untitled", Level: 1}
		}
		if current != nil {
			body = append(body, line)
		}
	}
	flush()
	return sections
}

func headingLevel(trimmed string) int {
	count := 0
	for _, r := range trimmed {
		if r != '#' {
			break
		}
		count++
	}
	if count < 1 {
		return defaultSectionHeading
	}
	if count > 6 {
		return 6
	}
	return count
}

func sectionLevel(section planSection) int {
	if section.Level > 0 {
		return section.Level
	}
	return defaultSectionHeading
}

func uniqueSectionID(existing []planSection, heading string) string {
	base := slug(heading)
	if base == "" {
		base = "section"
	}
	used := map[string]bool{}
	for _, section := range existing {
		used[section.ID] = true
	}
	id := base
	for i := 2; used[id]; i++ {
		id = fmt.Sprintf("%s-%d", base, i)
	}
	return id
}

func slug(value string) string {
	value = strings.ToLower(value)
	value = nonSlugChars.ReplaceAllString(value, "-")
	return strings.Trim(value, "-")
}

func restorePlanBody(source manuscriptPlan, planned manuscriptPlan) manuscriptPlan {
	sourceByID := map[string]planSection{}
	for _, section := range source.Sections {
		sourceByID[section.ID] = section
	}
	out := source
	if strings.TrimSpace(planned.Title) != "" {
		out.Title = strings.TrimSpace(planned.Title)
	}
	out.Subtitle = strings.TrimSpace(planned.Subtitle)
	for i := range out.Sections {
		if p, ok := findPlannedSection(planned.Sections, out.Sections[i].ID); ok {
			if strings.TrimSpace(p.DisplayHeading) != "" {
				out.Sections[i].DisplayHeading = strings.TrimSpace(p.DisplayHeading)
			}
			out.Sections[i].DropCap = p.DropCap
			out.Sections[i].Ornament = p.Ornament
			out.Sections[i].Illustration = p.Illustration
		}
		if src, ok := sourceByID[out.Sections[i].ID]; ok {
			out.Sections[i].OriginalHeading = src.OriginalHeading
			out.Sections[i].Level = src.Level
			out.Sections[i].BodyMarkdown = src.BodyMarkdown
		}
	}
	return out
}

func postProcessPlan(plan manuscriptPlan) manuscriptPlan {
	previousHadOrnament := false
	for i := range plan.Sections {
		section := &plan.Sections[i]
		if sameText(section.DisplayHeading, plan.Title) ||
			sameText(section.OriginalHeading, plan.Title) ||
			(plan.Subtitle != "" && (sameText(section.DisplayHeading, plan.Subtitle) || sameText(section.OriginalHeading, plan.Subtitle))) {
			section.DisplayHeading = ""
		}
		nextShort := i+1 < len(plan.Sections) && shortSection(plan.Sections[i+1])
		suppressOrnament := i <= 1 || previousHadOrnament || finalSectionLike(*section) || shortSection(*section) || nextShort
		if section.Ornament && suppressOrnament {
			section.Ornament = false
		}
		previousHadOrnament = section.Ornament
	}
	return plan
}

func comparableText(value string) string {
	value = strings.ToLower(value)
	replacer := strings.NewReplacer(
		"«", " ", "»", " ", "\"", " ", "'", " ", ".", " ", ",", " ", ":", " ", ";", " ",
		"!", " ", "?", " ", "(", " ", ")", " ", "[", " ", "]", " ", "{", " ", "}", " ",
		"—", " ", "–", " ", "-", " ",
	)
	return strings.Join(strings.Fields(replacer.Replace(value)), " ")
}

func sameText(a, b string) bool {
	left := comparableText(a)
	right := comparableText(b)
	if left == "" || right == "" {
		return false
	}
	return left == right || strings.Contains(left, right) || strings.Contains(right, left)
}

func finalSectionLike(section planSection) bool {
	text := comparableText(section.OriginalHeading + " " + section.DisplayHeading)
	return strings.Contains(text, "the end") ||
		strings.Contains(text, "finis") ||
		strings.Contains(text, "conclusion") ||
		strings.Contains(text, "epilogue") ||
		strings.Contains(text, "конец") ||
		strings.Contains(text, "послесловие")
}

func shortSection(section planSection) bool {
	return len([]rune(comparableText(section.BodyMarkdown))) < 180
}

func findPlannedSection(sections []planSection, id string) (planSection, bool) {
	for _, section := range sections {
		if section.ID == id {
			return section, true
		}
	}
	return planSection{}, false
}

func ensureIllustrations(plan manuscriptPlan, requested int) manuscriptPlan {
	if requested <= 0 {
		for i := range plan.Sections {
			plan.Sections[i].Illustration = nil
		}
		return plan
	}
	count := 0
	for _, section := range plan.Sections {
		if section.Illustration != nil {
			count++
		}
	}
	for i := range plan.Sections {
		if count >= requested {
			if plan.Sections[i].Illustration != nil && count > requested {
				plan.Sections[i].Illustration = nil
				count--
			}
			continue
		}
		if plan.Sections[i].Illustration == nil {
			plan.Sections[i].Illustration = fallbackIllustration(plan.Sections[i], i)
			count++
		}
	}
	return plan
}

func fallbackIllustration(section planSection, index int) *illustration {
	types := []string{"illuminated_miniature", "chapter_vignette", "botanical_marginalia", "woodcut_engraving"}
	kind := types[index%len(types)]
	text := truncateText(plainText(section.BodyMarkdown), 500)
	return &illustration{
		Type:    kind,
		Prompt:  fmt.Sprintf("Create a %s for a medieval fantasy manuscript section titled %q. Base it on this passage: %s", strings.ReplaceAll(kind, "_", " "), section.DisplayHeading, text),
		Caption: section.DisplayHeading,
	}
}

func imageSections(plan manuscriptPlan, limit int) []planSection {
	out := []planSection{}
	for _, section := range plan.Sections {
		if section.Illustration != nil {
			out = append(out, section)
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

func imageSize(kind string) string {
	switch kind {
	case "map", "chapter_vignette", "scribal_diagram":
		return "1536x1024"
	case "coat_of_arms":
		return "1024x1536"
	default:
		return "1024x1024"
	}
}

func illustrationStyle(kind string) string {
	base := "Transparent-background medieval manuscript cutout asset. Single isolated illustration only. PNG alpha cutout with empty transparent padding around the complete artwork. The full subject must be visible, centered, and not cropped by the image edges. No parchment, paper, page, backdrop, frame, readable text, caption, modern objects, beige texture, cream texture, flat square tile, or decorative background. Only the ink and watercolor artwork should have visible pixels. Hand-drawn ink, faded watercolor, lapis blue, vermilion red, verdigris green, violet shadows, and worn gold ornament when relevant."
	switch kind {
	case "map":
		return base + " Isolated fantasy cartography drawing only, with coastlines, rivers, mountains, ruins, old roads, compass marks, blue rivers, and red route marks."
	case "coat_of_arms":
		return base + " Isolated heraldic device only: shield, crest, symbolic beasts, plants, ribbons without text, worn gold leaf, aged red and lapis pigments."
	case "botanical_marginalia":
		return base + " Botanical marginalia cutout: curling vines, acanthus leaves, berries, flowers, small illuminated buds, worn gold accents."
	case "bestiary_creature":
		return base + " Bestiary creature cutout: dragon, griffin, basilisk, lion, serpent, strange bird, or hybrid beast."
	default:
		return base
	}
}

func plainText(markdown string) string {
	lines := strings.Split(markdown, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimSpace(strings.TrimLeft(line, "#>-*` "))
	}
	return strings.Join(lines, " ")
}

func truncateText(value string, max int) string {
	value = strings.TrimSpace(value)
	if len(value) <= max {
		return value
	}
	return strings.TrimSpace(value[:max]) + "..."
}

func fontCSS(style string) string {
	body := "/assets/manuscript/fonts/eb-garamond-latin-400.woff2"
	display := "/assets/manuscript/fonts/cormorant-garamond-latin-700.woff2"
	switch style {
	case "monomakh":
		body = "/assets/manuscript/fonts/monomakh-regular.otf"
		display = body
	case "ponomar":
		body = "/assets/manuscript/fonts/ponomar-regular.otf"
		display = body
	case "menaion":
		body = "/assets/manuscript/fonts/menaion-regular.otf"
		display = body
	case "fedorovsk":
		body = "/assets/manuscript/fonts/fedorovsk-regular.otf"
		display = body
	case "ruslan":
		body = "/assets/manuscript/fonts/ruslan-display-cyrillic-400.woff2"
		display = body
	case "uncial":
		body = "/assets/manuscript/fonts/uncial-antiqua-regular.ttf"
		display = body
	case "almendra":
		body = "/assets/manuscript/fonts/almendra-display-regular.ttf"
		display = body
	}
	return `@font-face{font-family:"Forge Body";src:url("` + body + `")}@font-face{font-family:"Forge Display";src:url("` + display + `");font-weight:700}`
}

func requestBaseURL(r *http.Request) string {
	proto := strings.TrimSpace(r.Header.Get("X-Forwarded-Proto"))
	if proto == "" {
		if r.TLS != nil {
			proto = "https"
		} else {
			proto = "http"
		}
	}
	host := strings.TrimSpace(r.Header.Get("X-Forwarded-Host"))
	if host == "" {
		host = r.Host
	}
	if host == "" {
		return ""
	}
	return proto + "://" + host
}

func renderPreviewHTML(plan manuscriptPlan, images map[string]generatedImage, settings generationSettings, baseURL string) string {
	fontSize := normalizedFontSize(settings.FontSize)
	paper := html.EscapeString(settings.Paper)
	ornament := html.EscapeString(settings.Ornament)
	divider := html.EscapeString(settings.Divider)
	titleDivider := html.EscapeString(settings.TitleDivider)
	dropcap := html.EscapeString(settings.Dropcap)
	ink := inkThemeForPaper(settings.Paper)
	dropcapBg := dropcapBackground(settings.Dropcap)
	blocks := manuscriptBlocks(plan, images, settings)
	pages := paginateManuscriptBlocks(blocks)

	var b strings.Builder
	b.WriteString(`<!doctype html><html lang="ru"><head><meta charset="utf-8">`)
	if baseURL != "" {
		b.WriteString(`<base href="` + html.EscapeString(strings.TrimRight(baseURL, "/")) + `/">`)
	}
	b.WriteString(`<style>`)
	b.WriteString(fontCSS(settings.FontStyle))
	b.WriteString(`:root{--paper-url:url("` + paper + `");--ornament-url:url("` + ornament + `");--divider-url:url("` + divider + `");--dropcap-url:url("` + dropcap + `");--dropcap-bg:` + dropcapBg + `;--manuscript-ink:` + ink.Ink + `;--manuscript-faded-ink:` + ink.FadedInk + `;--manuscript-red:` + ink.Red + `;--manuscript-gold:` + ink.Gold + `;}`)
	b.WriteString(`@page{size:A4;margin:0}html,body{margin:0;min-height:100%}*{box-sizing:border-box}.manuscript-root{--ink:var(--manuscript-ink);--faded-ink:var(--manuscript-faded-ink);--red:var(--manuscript-red);--gold:var(--manuscript-gold);color:var(--ink);min-height:100vh;background:#2c241b;font-family:"Forge Body",Georgia,serif;line-height:1.52}.manuscript-book{display:flex;flex-direction:column;align-items:center;gap:28px;padding:28px 18px}.manuscript-sheet{position:relative;width:min(100%,820px);aspect-ratio:210/297;overflow:hidden;background:radial-gradient(circle at 50% 18%,rgba(255,247,220,.16),transparent 36rem),var(--paper-url) center/100% 100% no-repeat,#e5c68f;box-shadow:0 18px 42px rgba(18,11,5,.34);break-after:page}.manuscript-sheet:last-child{break-after:auto}.manuscript-content{position:relative;z-index:1;height:100%;padding:54px 70px 70px 150px;overflow:hidden}.manuscript-margin-ornament{position:absolute;z-index:1;left:34px;top:86px;width:94px;height:calc(100% - 150px);background:var(--ornament-url) left top/contain no-repeat;pointer-events:none;opacity:.94}.manuscript-title{max-width:620px;margin:0 auto;color:#3a1209;font-family:"Forge Display","Forge Body",Georgia,serif;font-size:50px;line-height:.98;text-align:center}.manuscript-subtitle{max-width:590px;margin:14px auto 0;color:var(--faded-ink);font-size:21px;font-style:italic;text-align:center}.manuscript-title-rule,.manuscript-rule{display:flex;justify-content:center;margin:22px auto}.manuscript-title-rule img{width:min(100%,430px);height:auto;opacity:.78}.manuscript-rule span{display:block;width:min(100%,430px);height:42px;background:var(--divider-url) center/contain no-repeat;font-size:0}.manuscript-heading{margin:0 0 13px;color:var(--red);font-family:"Forge Display","Forge Body",Georgia,serif;font-size:28px;font-variant:small-caps;letter-spacing:0;line-height:1.12;text-align:center;break-after:avoid}.manuscript-heading.level-1{font-size:31px}.manuscript-heading.level-2{font-size:25px}.manuscript-heading.level-3,.manuscript-heading.level-4{font-size:22px}.manuscript-body{font-size:` + fmt.Sprint(fontSize) + `px}.manuscript-body p{margin:0 0 .78em;text-align:justify;text-wrap:pretty;hyphens:auto;orphans:3;widows:3}.manuscript-body.split-cont p{margin-bottom:0}.manuscript-body strong{color:inherit;font-weight:700;text-shadow:none}.manuscript-body em{font-style:italic}.manuscript-dropcap-letter{float:left;display:inline-grid;width:58px;height:58px;margin:3px 12px 2px 0;padding:0;place-items:center;color:#fff0b7;background:var(--dropcap-url) center/100% 100% no-repeat,var(--dropcap-bg);font-family:"Forge Display","Forge Body",Georgia,serif;font-size:41px;font-style:normal;font-weight:700;line-height:1;text-align:center;text-shadow:0 2px 0 rgba(61,15,11,.65)}.manuscript-body blockquote{margin:1em 0;padding:.55em .9em;color:#503018;border-left:3px solid rgba(122,23,15,.36);background:rgba(255,248,220,.2)}.manuscript-figure{position:relative;margin:20px auto 24px;padding-top:8px;text-align:center;break-inside:avoid}.manuscript-figure img{display:block;width:min(100%,500px);max-height:285px;margin:0 auto;object-fit:contain;border:0;mix-blend-mode:multiply;filter:contrast(.98) saturate(1.04);box-shadow:none}.manuscript-figure.illustration-map img,.manuscript-figure.illustration-chapter-vignette img,.manuscript-figure.illustration-scribal-diagram img{width:min(100%,610px);max-height:255px}.manuscript-figure.illustration-coat-of-arms img,.manuscript-figure.illustration-relic-study img,.manuscript-figure.illustration-bestiary-creature img{width:min(74%,280px);max-height:240px}.manuscript-figure.compact-figure{margin:12px auto 14px;padding-top:2px}.manuscript-figure.compact-figure img{max-height:190px}.manuscript-figure.compact-figure figcaption{margin-top:3px;font-size:12px}.manuscript-figure.illustration-illuminated-miniature img,.manuscript-figure.illustration-marginalia-scene img,.manuscript-figure.illustration-botanical-marginalia img{mix-blend-mode:normal;filter:contrast(.98) saturate(1.08)}.manuscript-figure figcaption{margin-top:5px;color:var(--faded-ink);font-size:13px;font-style:italic}.manuscript-placeholder{width:min(100%,420px);min-height:105px;margin:18px auto 8px;display:grid;place-items:center;background:var(--divider-url) center/contain no-repeat;font-size:0}.fallback{border:1px solid rgba(116,27,19,.22);padding:18px;color:#7b5b2d;background:rgba(255,246,220,.32)}@media print{html,body,.manuscript-root{width:210mm;min-height:297mm;background:transparent}.manuscript-book{display:block;padding:0}.manuscript-sheet{width:210mm;height:297mm;box-shadow:none;page-break-after:always}.manuscript-sheet:last-child{page-break-after:auto}.manuscript-content{padding:14mm 18mm 18mm 39mm}.manuscript-margin-ornament{left:8mm;top:25mm;width:27mm;height:235mm}}`)
	b.WriteString(`</style></head><body class="manuscript-root"><article class="manuscript-book">`)
	for i, pageBlocks := range pages {
		b.WriteString(`<section class="manuscript-sheet" data-page="` + fmt.Sprint(i+1) + `"><div class="manuscript-margin-ornament" aria-hidden="true"></div><div class="manuscript-content">`)
		for _, block := range pageBlocks {
			b.WriteString(block.HTML)
		}
		b.WriteString(`</div></section>`)
	}
	if len(pages) == 0 {
		b.WriteString(`<section class="manuscript-sheet"><div class="manuscript-margin-ornament" aria-hidden="true"></div><div class="manuscript-content"><header class="manuscript-cover"><h1 class="manuscript-title">` + html.EscapeString(plan.Title) + `</h1>`)
		if plan.Subtitle != "" {
			b.WriteString(`<p class="manuscript-subtitle">` + html.EscapeString(plan.Subtitle) + `</p>`)
		}
		if titleDivider != "" {
			b.WriteString(`<div class="manuscript-title-rule"><img src="` + titleDivider + `" alt=""></div>`)
		}
		b.WriteString(`</header></div></section>`)
	}
	b.WriteString(`</article></body></html>`)
	return b.String()
}

func markdownBlocks(markdown string) []markdownBlock {
	parts := strings.Split(markdown, "\n")
	out := []markdownBlock{}
	current := []string{}
	flush := func() {
		if len(current) > 0 {
			out = append(out, markdownBlock{Kind: "p", Text: strings.Join(current, " ")})
			current = []string{}
		}
	}
	for _, line := range parts {
		line = strings.TrimSpace(line)
		if line == "" {
			flush()
			continue
		}
		if markdownRule.MatchString(line) {
			flush()
			out = append(out, markdownBlock{Kind: "hr"})
			continue
		}
		if match := markdownHeading.FindStringSubmatch(line); match != nil {
			flush()
			out = append(out, markdownBlock{Kind: "heading", Text: strings.TrimSpace(match[2])})
			continue
		}
		current = append(current, line)
	}
	flush()
	return out
}

func renderInlineMarkdown(value string) string {
	escaped := html.EscapeString(value)
	escaped = markdownStrong.ReplaceAllString(escaped, "<strong>$1</strong>")
	escaped = markdownEmphasis.ReplaceAllString(escaped, "<em>$1</em>")
	return shortWordBreak.ReplaceAllString(escaped, "$1$2&nbsp;$3")
}

func manuscriptBlocks(plan manuscriptPlan, images map[string]generatedImage, settings generationSettings) []manuscriptBlock {
	blocks := []manuscriptBlock{{
		HTML:         coverHTML(plan, settings),
		Units:        coverUnits(plan),
		KeepWithNext: true,
		Kind:         "cover",
	}}

	for index, section := range plan.Sections {
		sectionBlocks := []manuscriptBlock{}
		if section.Ornament && index > 1 {
			blocks = append(blocks, manuscriptBlock{HTML: `<div class="manuscript-rule"><span></span></div>`, Units: 7, Kind: "rule"})
		}

		if shouldRenderSectionHeading(plan, section, index) {
			level := sectionLevel(section)
			sectionBlocks = append(sectionBlocks, manuscriptBlock{
				HTML:          `<h` + fmt.Sprint(level) + ` class="manuscript-heading level-` + fmt.Sprint(level) + `">` + html.EscapeString(section.DisplayHeading) + `</h` + fmt.Sprint(level) + `>`,
				Units:         headingUnits(level),
				KeepWithNext:  true,
				NewPageBefore: settings.ChapterStart != "inline" && index > 0 && level <= 2,
				Kind:          "heading",
			})
		}

		bodyBlocks := markdownToManuscriptBlocks(section.BodyMarkdown, section.DropCap, settings)
		sectionBlocks = append(sectionBlocks, bodyBlocks...)
		if fig := figureBlock(section, images); fig != nil {
			sectionBlocks = append(sectionBlocks, *fig)
		}

		if len(sectionBlocks) > 0 && settings.ChapterStart == "auto" {
			if idx := firstNewPageBlock(sectionBlocks); idx >= 0 {
				sum := 0.0
				for _, block := range sectionBlocks[:minInt(3, len(sectionBlocks))] {
					sum += block.Units
				}
				sectionBlocks[idx].FitSectionUnits = minFloat(sum, newSectionStartUnits)
			}
		}
		blocks = append(blocks, sectionBlocks...)
	}
	return trimRules(blocks)
}

func coverHTML(plan manuscriptPlan, settings generationSettings) string {
	var b strings.Builder
	b.WriteString(`<header class="manuscript-cover"><h1 class="manuscript-title">` + html.EscapeString(plan.Title) + `</h1>`)
	if strings.TrimSpace(plan.Subtitle) != "" {
		b.WriteString(`<p class="manuscript-subtitle">` + html.EscapeString(plan.Subtitle) + `</p>`)
	}
	if strings.TrimSpace(settings.TitleDivider) != "" {
		b.WriteString(`<div class="manuscript-title-rule"><img src="` + html.EscapeString(settings.TitleDivider) + `" alt=""></div>`)
	}
	b.WriteString(`</header>`)
	return b.String()
}

func coverUnits(plan manuscriptPlan) float64 {
	if strings.TrimSpace(plan.Subtitle) != "" {
		return 28
	}
	return 23
}

func shouldRenderSectionHeading(plan manuscriptPlan, section planSection, index int) bool {
	if strings.TrimSpace(section.DisplayHeading) == "" {
		return false
	}
	if index != 0 {
		return true
	}
	title := normalizedTitle(plan.Title)
	return normalizedTitle(section.DisplayHeading) != title && normalizedTitle(section.OriginalHeading) != title
}

func normalizedTitle(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(value), " "))
}

func headingUnits(level int) float64 {
	if level <= 1 {
		return 11
	}
	return 8
}

func markdownToManuscriptBlocks(markdown string, dropCap bool, settings generationSettings) []manuscriptBlock {
	blocks := []manuscriptBlock{}
	firstParagraph := true
	for _, block := range markdownBlocks(markdown) {
		switch block.Kind {
		case "hr":
			blocks = append(blocks, manuscriptBlock{HTML: `<div class="manuscript-rule"><span></span></div>`, Units: 7, Kind: "rule"})
		case "heading":
			blocks = append(blocks, manuscriptBlock{
				HTML:         `<h3 class="manuscript-heading level-3">` + html.EscapeString(block.Text) + `</h3>`,
				Units:        7,
				KeepWithNext: true,
				Kind:         "heading",
			})
		default:
			paragraphs := splitLongParagraph(block.Text)
			for i, paragraph := range paragraphs {
				className := "manuscript-body"
				if len(paragraphs) > 1 && i < len(paragraphs)-1 {
					className += " split-cont"
				}
				htmlBlock := `<div class="` + className + `"><p>` + renderInlineMarkdown(paragraph) + `</p></div>`
				if dropCap && firstParagraph {
					htmlBlock = renderDropcapBlock(paragraph, className+" drop-cap")
				}
				firstParagraph = false
				blocks = append(blocks, manuscriptBlock{HTML: htmlBlock, Units: textUnits(paragraph, settings.FontSize), Kind: "text"})
			}
		}
	}
	return blocks
}

func splitLongParagraph(text string) []string {
	text = strings.TrimSpace(text)
	if len([]rune(text)) < 560 {
		return []string{text}
	}
	parts := []string{}
	current := strings.Builder{}
	for _, token := range strings.Fields(text) {
		if current.Len()+len(token) > 380 && current.Len() > 0 {
			parts = append(parts, strings.TrimSpace(current.String()))
			current.Reset()
		}
		if current.Len() > 0 {
			current.WriteByte(' ')
		}
		current.WriteString(token)
		if strings.ContainsAny(token, ".!?。！？»”") && current.Len() > 360 {
			parts = append(parts, strings.TrimSpace(current.String()))
			current.Reset()
		}
	}
	if strings.TrimSpace(current.String()) != "" {
		parts = append(parts, strings.TrimSpace(current.String()))
	}
	return parts
}

func renderDropcapBlock(text string, className string) string {
	clean := strings.TrimSpace(markdownMarker.ReplaceAllString(text, ""))
	if clean == "" {
		return `<div class="` + className + `"><p></p></div>`
	}
	runes := []rune(clean)
	return `<div class="` + className + `"><p><span class="manuscript-dropcap-letter">` +
		html.EscapeString(string(runes[0])) + `</span>` + html.EscapeString(string(runes[1:])) + `</p></div>`
}

func textUnits(text string, fontSize int) float64 {
	normalized := strings.Join(strings.Fields(plainText(text)), " ")
	size := normalizedFontSize(fontSize)
	charsPerLine := maxInt(42, 58-(size-16)*2)
	lineUnits := 3.65 * (float64(size) / 20.0)
	lines := maxInt(1, (len([]rune(normalized))+charsPerLine-1)/charsPerLine)
	return maxFloat(5.5, float64(lines)*lineUnits+3)
}

func figureBlock(section planSection, images map[string]generatedImage) *manuscriptBlock {
	if section.Illustration == nil {
		return nil
	}
	img := images[section.ID]
	caption := html.EscapeString(section.Illustration.Caption)
	typeClass := "illustration-" + strings.ReplaceAll(section.Illustration.Type, "_", "-")
	var b strings.Builder
	b.WriteString(`<figure class="manuscript-figure ` + typeClass + `">`)
	if !img.Failed && img.URL != "" {
		b.WriteString(`<img src="` + html.EscapeString(img.URL) + `" alt="` + caption + `">`)
	} else {
		b.WriteString(`<div class="manuscript-placeholder fallback">Illustration unavailable</div>`)
	}
	b.WriteString(`<figcaption>` + caption + `</figcaption></figure>`)
	units := 26.0
	if section.Illustration.Type == "map" || section.Illustration.Type == "chapter_vignette" {
		units = 24
	}
	return &manuscriptBlock{HTML: b.String(), Units: units, Kind: "figure"}
}

func firstNewPageBlock(blocks []manuscriptBlock) int {
	for i, block := range blocks {
		if block.NewPageBefore {
			return i
		}
	}
	return -1
}

func paginateManuscriptBlocks(blocks []manuscriptBlock) [][]manuscriptBlock {
	pages := [][]manuscriptBlock{}
	current := []manuscriptBlock{}
	used := 0.0
	capacity := func() float64 {
		if len(pages) == 0 {
			return firstPageUnits
		}
		return pageUnits
	}
	pushPage := func() {
		if len(current) > 0 {
			pages = append(pages, current)
		}
		current = []manuscriptBlock{}
		used = 0
	}

	for i, block := range blocks {
		nextUnits := 0.0
		if i+1 < len(blocks) {
			nextUnits = minFloat(blocks[i+1].Units, minNextPageUnits)
		}
		required := block.Units
		if block.KeepWithNext && nextUnits > 0 {
			required += nextUnits
		}
		sectionFitsCurrent := block.FitSectionUnits > 0 && used+block.FitSectionUnits <= capacity()
		if block.NewPageBefore && len(current) > 0 && !sectionFitsCurrent {
			pushPage()
		}
		tooCloseToBottom := len(current) > 0 && used+required > capacity()
		if tooCloseToBottom && block.Kind == "figure" && capacity()-used >= 16 {
			block.HTML = strings.Replace(block.HTML, "manuscript-figure", "manuscript-figure compact-figure", 1)
			block.Units = minFloat(block.Units, maxFloat(14, capacity()-used))
		} else if tooCloseToBottom {
			pushPage()
		}
		current = append(current, block)
		used += block.Units
		if used > capacity()-4 && i < len(blocks)-1 {
			pushPage()
		}
	}
	pushPage()
	return pages
}

func trimRules(blocks []manuscriptBlock) []manuscriptBlock {
	out := []manuscriptBlock{}
	for i, block := range blocks {
		isRule := block.Kind == "rule"
		prev := manuscriptBlock{}
		if len(out) > 0 {
			prev = out[len(out)-1]
		}
		nextLooksEnd := false
		if i+1 < len(blocks) {
			lower := strings.ToLower(blocks[i+1].HTML)
			nextLooksEnd = strings.Contains(lower, "конец тома") || strings.Contains(lower, "the end")
		}
		if isRule && (len(out) == 0 || prev.Kind == "rule" || prev.Kind == "cover" || prev.Kind == "heading" || nextLooksEnd || i == len(blocks)-1) {
			continue
		}
		out = append(out, block)
	}
	return out
}

type inkTheme struct {
	Ink      string
	FadedInk string
	Red      string
	Gold     string
}

func inkThemeForPaper(paperPath string) inkTheme {
	normalized := strings.ToLower(paperPath)
	if strings.Contains(normalized, "dark") || strings.Contains(normalized, "stained-alchemist") {
		return inkTheme{Ink: "#f5dfaf", FadedInk: "#e0bd7b", Red: "#ffd08a", Gold: "#f0c35e"}
	}
	return inkTheme{Ink: "#241105", FadedInk: "#553217", Red: "#7a170f", Gold: "#a46f1e"}
}

func dropcapBackground(dropcapPath string) string {
	normalized := strings.ToLower(dropcapPath)
	switch {
	case strings.Contains(normalized, "aged-ink"):
		return "#182235"
	case strings.Contains(normalized, "cintric"):
		return "#102b61"
	case strings.Contains(normalized, "herbal"):
		return "#183a22"
	case strings.Contains(normalized, "royal2"):
		return "#0e2e73"
	case strings.Contains(normalized, "royal"):
		return "#6d120c"
	case strings.Contains(normalized, "slavic"):
		return "#120f0b"
	case strings.Contains(normalized, "vine"):
		return "#d5aa46"
	case strings.Contains(normalized, "blue"):
		return "#123044"
	case strings.Contains(normalized, "dark"), strings.Contains(normalized, "woodcut"):
		return "#1f1712"
	default:
		return "#5a150d"
	}
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func normalizedFontSize(value int) int {
	if value < 16 || value > 24 {
		return 20
	}
	return value
}

func renderPDF(ctx context.Context, path string, htmlDoc string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	allocOpts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
	)
	if chromeBin := strings.TrimSpace(os.Getenv("CHROME_BIN")); chromeBin != "" {
		allocOpts = append(allocOpts, chromedp.ExecPath(chromeBin))
	}
	allocCtx, cancelAlloc := chromedp.NewExecAllocator(ctx, allocOpts...)
	defer cancelAlloc()

	printCtx, cancelPrint := chromedp.NewContext(allocCtx)
	defer cancelPrint()

	printCtx, cancelTimeout := context.WithTimeout(printCtx, 90*time.Second)
	defer cancelTimeout()

	var pdfBytes []byte
	dataURL := "data:text/html;base64," + base64.StdEncoding.EncodeToString([]byte(htmlDoc))
	if err := chromedp.Run(printCtx,
		chromedp.Navigate(dataURL),
		chromedp.WaitReady("body", chromedp.ByQuery),
		chromedp.Sleep(1200*time.Millisecond),
		chromedp.ActionFunc(func(ctx context.Context) error {
			buf, _, err := page.PrintToPDF().
				WithPrintBackground(true).
				WithPreferCSSPageSize(true).
				Do(ctx)
			if err != nil {
				return err
			}
			pdfBytes = buf
			return nil
		}),
	); err != nil {
		return err
	}
	return os.WriteFile(path, pdfBytes, 0o644)
}
