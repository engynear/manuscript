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

	"github.com/jung-kurt/gofpdf"
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

var nonSlugChars = regexp.MustCompile(`[^a-z0-9]+`)

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

	w.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
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
	jobDir := filepath.Join(s.cfg.MediaDir, "generated", hash)
	imageDir := filepath.Join(jobDir, "images")
	if err := os.MkdirAll(imageDir, 0o755); err != nil {
		send(generationProgress{Type: "error", Message: "could not prepare output directory"})
		return
	}

	send(generationProgress{Type: "progress", Step: "plan", Message: "Preparing manuscript plan", Progress: 18})
	plan, err := s.generatePlan(ctx, req.Markdown, req.Settings.ImageLimit)
	if err != nil {
		send(generationProgress{Type: "progress", Step: "plan-fallback", Message: "Using local plan fallback", Progress: 24})
		plan = localPlan(req.Markdown, req.Settings.ImageLimit)
	}
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

		img, err := s.generateSectionImage(ctx, hash, imageDir, section)
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
				Message:  fmt.Sprintf("Illustration %d/%d complete", i+1, len(sectionsWithImages)),
				Progress: progress + 4,
				Detail:   map[string]interface{}{"sectionId": section.ID},
			})
		}
		images[section.ID] = img
	}

	send(generationProgress{Type: "progress", Step: "html", Message: "Composing preview", Progress: 72})
	previewHTML := renderPreviewHTML(plan, images, req.Settings)

	send(generationProgress{Type: "progress", Step: "pdf", Message: "Binding PDF", Progress: 88})
	pdfPath := filepath.Join(jobDir, "manuscript.pdf")
	if err := renderPDF(pdfPath, plan, images); err != nil {
		send(generationProgress{Type: "error", Message: "could not create PDF"})
		return
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
		Markdown string             `json:"markdown"`
		Settings generationSettings `json:"settings"`
	}{Markdown: markdown, Settings: settings})
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

func (s *Server) generatePlan(ctx context.Context, markdown string, imageLimit int) (manuscriptPlan, error) {
	if strings.TrimSpace(s.cfg.OpenAIKey) == "" {
		return manuscriptPlan{}, fmt.Errorf("OPENAI_API_KEY is not configured")
	}

	sourcePlan := localPlan(markdown, imageLimit)
	type sectionForModel struct {
		ID      string `json:"id"`
		Heading string `json:"heading"`
		Excerpt string `json:"excerpt"`
	}
	sections := make([]sectionForModel, 0, len(sourcePlan.Sections))
	for _, section := range sourcePlan.Sections {
		sections = append(sections, sectionForModel{
			ID:      section.ID,
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

func (s *Server) generateSectionImage(ctx context.Context, hash, imageDir string, section planSection) (generatedImage, error) {
	if section.Illustration == nil {
		return generatedImage{}, fmt.Errorf("section has no illustration")
	}
	if strings.TrimSpace(s.cfg.OpenAIKey) == "" {
		return generatedImage{}, fmt.Errorf("OPENAI_API_KEY is not configured")
	}

	fileName := section.ID + ".png"
	filePath := filepath.Join(imageDir, fileName)
	publicURL := strings.TrimRight(s.cfg.MediaBaseURL, "/") + "/generated/" + hash + "/images/" + fileName

	if _, err := os.Stat(filePath); err == nil {
		return generatedImage{SectionID: section.ID, URL: publicURL, FilePath: filePath, Caption: section.Illustration.Caption}, nil
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
		return generatedImage{}, err
	}
	if len(result.Data) == 0 {
		return generatedImage{}, fmt.Errorf("empty image response")
	}
	if result.Data[0].B64JSON != "" {
		raw, err := base64.StdEncoding.DecodeString(result.Data[0].B64JSON)
		if err != nil {
			return generatedImage{}, err
		}
		if err := os.WriteFile(filePath, raw, 0o644); err != nil {
			return generatedImage{}, err
		}
	} else if result.Data[0].URL != "" {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, result.Data[0].URL, nil)
		if err != nil {
			return generatedImage{}, err
		}
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return generatedImage{}, err
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode > 299 {
			return generatedImage{}, fmt.Errorf("image download failed: %s", resp.Status)
		}
		out, err := os.Create(filePath)
		if err != nil {
			return generatedImage{}, err
		}
		defer out.Close()
		if _, err := io.Copy(out, resp.Body); err != nil {
			return generatedImage{}, err
		}
	} else {
		return generatedImage{}, fmt.Errorf("image response did not include data")
	}

	return generatedImage{SectionID: section.ID, URL: publicURL, FilePath: filePath, Caption: section.Illustration.Caption}, nil
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
		if strings.HasPrefix(trimmed, "# ") || strings.HasPrefix(trimmed, "## ") {
			flush()
			heading := strings.TrimSpace(strings.TrimLeft(trimmed, "#"))
			current = &planSection{
				ID:              uniqueSectionID(sections, heading),
				OriginalHeading: heading,
				DisplayHeading:  heading,
			}
			continue
		}
		if current == nil && trimmed != "" {
			current = &planSection{ID: "section-1", OriginalHeading: "Untitled", DisplayHeading: "Untitled"}
		}
		if current != nil {
			body = append(body, line)
		}
	}
	flush()
	return sections
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
			out.Sections[i].BodyMarkdown = src.BodyMarkdown
		}
	}
	return out
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
	base := "Transparent-background medieval manuscript cutout asset. Single isolated illustration only. PNG alpha cutout. No parchment, paper, page, backdrop, frame, readable text, modern objects, or beige texture. Hand-drawn ink, faded watercolor, lapis blue, vermilion red, verdigris green, violet shadows, and worn gold ornament when relevant."
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

func renderPreviewHTML(plan manuscriptPlan, images map[string]generatedImage, settings generationSettings) string {
	paper := html.EscapeString(settings.Paper)
	ornament := html.EscapeString(settings.Ornament)
	divider := html.EscapeString(settings.Divider)
	var b strings.Builder
	b.WriteString(`<!doctype html><html><head><meta charset="utf-8"><style>`)
	b.WriteString(`body{margin:0;background:#2b2118;color:#2d1c0f;font-family:Georgia,serif}.wrap{display:grid;gap:24px;padding:24px}.page{position:relative;box-sizing:border-box;width:min(760px,calc(100vw - 48px));min-height:1050px;margin:0 auto;padding:72px 76px 72px 126px;background:#ead8ad;background-image:url("` + paper + `");background-size:cover;box-shadow:0 18px 60px rgba(0,0,0,.42);overflow:hidden}.orn{position:absolute;left:28px;top:72px;bottom:72px;width:56px;object-fit:contain;object-position:top}h1,h2{text-align:center;color:#741b13;line-height:1.15}h1{font-size:42px;margin:0 0 10px}h2{font-size:28px;margin:30px 0 14px}p{font-size:18px;line-height:1.72;text-align:justify}.divider{display:block;width:58%;height:34px;margin:12px auto 20px;object-fit:contain}.figure{margin:24px auto;text-align:center}.figure img{max-width:92%;max-height:420px;object-fit:contain}.caption{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7b5b2d}.fallback{border:1px solid rgba(116,27,19,.22);padding:18px;color:#7b5b2d;background:rgba(255,246,220,.32)}`)
	b.WriteString(`</style></head><body><div class="wrap">`)
	b.WriteString(`<section class="page">`)
	if ornament != "" {
		b.WriteString(`<img class="orn" src="` + ornament + `" alt="">`)
	}
	b.WriteString(`<h1>` + html.EscapeString(plan.Title) + `</h1>`)
	if plan.Subtitle != "" {
		b.WriteString(`<p style="text-align:center;font-style:italic">` + html.EscapeString(plan.Subtitle) + `</p>`)
	}
	if divider != "" {
		b.WriteString(`<img class="divider" src="` + divider + `" alt="">`)
	}
	for i, section := range plan.Sections {
		if i > 0 {
			b.WriteString(`<h2>` + html.EscapeString(section.DisplayHeading) + `</h2>`)
		}
		for _, p := range markdownParagraphs(section.BodyMarkdown) {
			b.WriteString(`<p>` + html.EscapeString(p) + `</p>`)
		}
		if section.Illustration != nil {
			img := images[section.ID]
			b.WriteString(`<figure class="figure">`)
			if !img.Failed && img.URL != "" {
				b.WriteString(`<img src="` + html.EscapeString(img.URL) + `" alt="">`)
			} else {
				b.WriteString(`<div class="fallback">Illustration unavailable</div>`)
			}
			b.WriteString(`<figcaption class="caption">` + html.EscapeString(section.Illustration.Caption) + `</figcaption></figure>`)
		}
	}
	b.WriteString(`</section></div></body></html>`)
	return b.String()
}

func markdownParagraphs(markdown string) []string {
	parts := strings.Split(markdown, "\n")
	out := []string{}
	current := []string{}
	flush := func() {
		if len(current) > 0 {
			out = append(out, strings.Join(current, " "))
			current = []string{}
		}
	}
	for _, line := range parts {
		line = strings.TrimSpace(line)
		if line == "" {
			flush()
			continue
		}
		if strings.HasPrefix(line, "#") {
			continue
		}
		current = append(current, line)
	}
	flush()
	return out
}

func renderPDF(path string, plan manuscriptPlan, images map[string]generatedImage) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetTitle(plan.Title, true)
	pdf.SetMargins(22, 22, 22)
	pdf.SetAutoPageBreak(true, 22)
	pdf.AddPage()
	pdf.SetFont("Times", "B", 24)
	pdf.SetTextColor(116, 27, 19)
	pdf.MultiCell(0, 12, plan.Title, "", "C", false)
	if plan.Subtitle != "" {
		pdf.SetFont("Times", "I", 14)
		pdf.SetTextColor(74, 52, 30)
		pdf.MultiCell(0, 8, plan.Subtitle, "", "C", false)
	}
	pdf.Ln(6)
	for i, section := range plan.Sections {
		if i > 0 {
			pdf.SetFont("Times", "B", 18)
			pdf.SetTextColor(116, 27, 19)
			pdf.Ln(5)
			pdf.MultiCell(0, 9, section.DisplayHeading, "", "C", false)
			pdf.Ln(2)
		}
		pdf.SetFont("Times", "", 12)
		pdf.SetTextColor(45, 28, 15)
		for _, p := range markdownParagraphs(section.BodyMarkdown) {
			pdf.MultiCell(0, 6.5, p, "", "J", false)
			pdf.Ln(1.5)
		}
		if section.Illustration != nil {
			img := images[section.ID]
			if !img.Failed && img.FilePath != "" {
				if pdf.GetY() > 195 {
					pdf.AddPage()
				}
				opts := gofpdf.ImageOptions{ImageType: "PNG", ReadDpi: true}
				pdf.ImageOptions(img.FilePath, 45, pdf.GetY()+4, 120, 0, false, opts, 0, "")
				pdf.Ln(92)
			}
			pdf.SetFont("Times", "I", 10)
			pdf.SetTextColor(95, 71, 38)
			pdf.MultiCell(0, 5, section.Illustration.Caption, "", "C", false)
			pdf.Ln(3)
		}
	}
	return pdf.OutputFileAndClose(path)
}
