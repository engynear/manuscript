package forge

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

const maxIllustrations = 8

// GenerateRawPlan calls OpenAI and returns the plan after capping illustrations
// and restoring source bodies — but BEFORE post-processing / illustration top-up.
// This is the cacheable unit (keyed by content hash), mirroring lib/generatePlan.ts
// which caches here and applies postProcess + ensureIllustrationCount afterward.
func GenerateRawPlan(ctx context.Context, client *Client, norm NormalizedMarkdown) (Plan, error) {
	brief := makeBrief(norm.Sections)

	userPrompt := fmt.Sprintf(`Create a medieval fantasy manuscript plan for this Markdown. Requirements:
- Keep every section id exactly as provided.
- Set bodyMarkdown to an empty string "" for every section. Do NOT copy, summarize, rewrite, or continue the prose — the server restores the original full Markdown by id after validation. (Emitting empty bodies keeps you fast.)
- Never invent missing prose and never remove sentences.
- Use at most 8 illustrations total.
- Choose illustration types from: map, coat_of_arms, woodcut_engraving, illuminated_miniature, chapter_vignette, marginalia_scene, botanical_marginalia, bestiary_creature, relic_study, scribal_diagram.
- Image prompts must describe isolated cutout artwork with transparent alpha. Explicitly avoid parchment, paper, page, manuscript sheet, backdrop, environment, sky, ground, vignette, beige texture, glow, hard frames, and readable text.
- For the MVP, prefer illustration placement "after"; illustrations should sit inside their own section after opening prose.
- Use drop caps on important opening sections.
- Use ornaments where a divider would improve pacing.

Sections:
%s`, briefJSON(brief))

	systemPrompt := "You are an expert book designer and fantasy editor. Return only valid structured JSON that follows the schema. Preserve the meaning and section order of the source while making headings literary and manuscript-like."

	raw, err := client.GeneratePlan(ctx, systemPrompt, userPrompt, planJSONSchema())
	if err != nil {
		return Plan{}, fmt.Errorf("generatePlan: %w", err)
	}

	var plan Plan
	if err := json.Unmarshal([]byte(raw), &plan); err != nil {
		return Plan{}, fmt.Errorf("plan JSON parse: %w", err)
	}

	plan = capIllustrations(plan, maxIllustrations)
	plan = restoreSourceBodies(plan, norm)
	return plan, nil
}

// FinalizePlan applies post-processing and illustration top-up to a raw plan.
// Run on every request (imageLimit may differ from the cached run). Port of the
// post-cache steps in app/api/generate/route.ts:79.
func FinalizePlan(raw Plan, imageLimit int) Plan {
	plan := postProcessPlan(raw)
	plan = ensureIllustrationCount(plan, imageLimit)
	return plan
}

// --- section brief -------------------------------------------------------

type sectionBrief struct {
	ID              string `json:"id"`
	Level           int    `json:"level"`
	OriginalHeading string `json:"originalHeading"`
	Excerpt         string `json:"excerpt"`
	BodyLength      int    `json:"bodyLength"`
}

func makeBrief(sections []NormalizedSection) []sectionBrief {
	out := make([]sectionBrief, len(sections))
	for i, s := range sections {
		exc := s.BodyMarkdown
		if len(exc) > 1800 {
			exc = exc[:1800]
		}
		out[i] = sectionBrief{
			ID:              s.ID,
			Level:           s.Level,
			OriginalHeading: s.OriginalHeading,
			Excerpt:         exc,
			BodyLength:      len(s.BodyMarkdown),
		}
	}
	return out
}

func briefJSON(brief []sectionBrief) string {
	b, _ := json.MarshalIndent(brief, "", "  ")
	return string(b)
}

// --- post-process (port of lib/postProcessPlan.ts) -----------------------

func postProcessPlan(plan Plan) Plan {
	prevHadOrnament := false
	sections := make([]Section, len(plan.Sections))
	for i, s := range plan.Sections {
		displayDupesTitle := sameText(s.DisplayHeading, plan.Title) ||
			sameText(s.OriginalHeading, plan.Title) ||
			(plan.Subtitle != "" && (sameText(s.DisplayHeading, plan.Subtitle) || sameText(s.OriginalHeading, plan.Subtitle)))

		var next *Section
		if i+1 < len(plan.Sections) {
			n := plan.Sections[i+1]
			next = &n
		}
		suppressOrnament := i <= 1 || prevHadOrnament || finalLike(s) || shortBody(s) ||
			(next != nil && shortBody(*next))

		ornament := s.Ornament && !suppressOrnament
		prevHadOrnament = ornament

		heading := s.DisplayHeading
		if displayDupesTitle {
			heading = ""
		}
		sections[i] = s
		sections[i].DisplayHeading = heading
		sections[i].Ornament = ornament
	}
	return Plan{Title: plan.Title, Subtitle: plan.Subtitle, Style: plan.Style, Sections: sections}
}

func comparable(v string) string {
	r := strings.ToLower(v)
	r = strings.NewReplacer(`«`, " ", `»`, " ", `"`, " ", `"`, " ", `'`, " ", `'`, " ",
		".", " ", ",", " ", ":", " ", ";", " ", "!", " ", "?", " ",
		"(", " ", ")", " ", "[", " ", "]", " ", "{", " ", "}", " ",
		"—", " ", "–", " ", "-", " ").Replace(r)
	return strings.Join(strings.Fields(r), " ")
}

func sameText(a, b string) bool {
	ca, cb := comparable(a), comparable(b)
	if ca == "" || cb == "" {
		return false
	}
	return ca == cb || strings.Contains(ca, cb) || strings.Contains(cb, ca)
}

func finalLike(s Section) bool {
	text := comparable(s.OriginalHeading + " " + s.DisplayHeading)
	return strings.Contains(text, "end") || strings.Contains(text, "finis") ||
		strings.Contains(text, "conclusion") || strings.Contains(text, "epilogue") ||
		strings.Contains(text, "конец") || strings.Contains(text, "послесловие")
}

func shortBody(s Section) bool { return len(comparable(s.BodyMarkdown)) < 180 }

// --- cap illustrations (port of lib/generatePlan.ts capIllustrations) ----

func capIllustrations(plan Plan, max int) Plan {
	remaining := max
	sections := make([]Section, len(plan.Sections))
	for i, s := range plan.Sections {
		if s.Illustration != nil {
			if remaining > 0 {
				remaining--
			} else {
				s.Illustration = nil
			}
		}
		sections[i] = s
	}
	return Plan{Title: plan.Title, Subtitle: plan.Subtitle, Style: plan.Style, Sections: sections}
}

// --- ensure illustration count (port of lib/ensureIllustrations.ts) ------

func ensureIllustrationCount(plan Plan, requested int) Plan {
	target := requested
	if target > maxIllustrations {
		target = maxIllustrations
	}
	if target > len(plan.Sections) {
		target = len(plan.Sections)
	}
	if target < 0 {
		target = 0
	}
	current := 0
	for _, s := range plan.Sections {
		if s.Illustration != nil {
			current++
		}
	}
	if current >= target {
		return plan
	}
	remaining := target - current
	sections := make([]Section, len(plan.Sections))
	for i, s := range plan.Sections {
		if remaining > 0 && s.Illustration == nil {
			plain := plainText(s.BodyMarkdown)
			if len(plain) >= 80 || i == 0 {
				s.Illustration = illustrationForSection(s, i)
				remaining--
			}
		}
		sections[i] = s
	}
	return Plan{Title: plan.Title, Subtitle: plan.Subtitle, Style: plan.Style, Sections: sections}
}

var fallbackTypes = []string{
	"marginalia_scene", "illuminated_miniature", "woodcut_engraving",
	"scribal_diagram", "chapter_vignette",
}

func illustrationForSection(s Section, idx int) *Illustration {
	heading := s.DisplayHeading
	if heading == "" {
		heading = s.OriginalHeading
	}
	if heading == "" {
		heading = fmt.Sprintf("Section %d", idx+1)
	}
	text := plainText(s.BodyMarkdown)
	if len(text) > 420 {
		text = text[:420]
	}
	t := illustrationTypeForSection(heading, text, idx)
	typeLabel := strings.ReplaceAll(t, "_", " ")
	caption := heading
	if len(caption) > 130 {
		caption = strings.TrimRight(caption[:127], " ") + "..."
	}
	return &Illustration{
		Type:      t,
		Placement: "after",
		Prompt: fmt.Sprintf(`Create a %s for a medieval fantasy manuscript section titled "%s". Base the image on this passage: %s. Make it a single isolated cutout artwork with transparent alpha background. Only the illustrated subject and decorative medieval ink, faded watercolor, foliage, figures, symbols, or worn gold should be visible. Do not include parchment, paper, page, manuscript sheet, backdrop, environment, sky, ground, vignette, beige texture, glow, square frame, or readable text.`,
			typeLabel, heading, text),
		Caption: caption,
	}
}

func illustrationTypeForSection(heading, text string, idx int) string {
	hay := strings.ToLower(heading + " " + text)
	switch {
	case strings.Contains(hay, "map") || strings.Contains(hay, "land") || strings.Contains(hay, "realm"):
		return "map"
	case strings.Contains(hay, "crest") || strings.Contains(hay, "seal") || strings.Contains(hay, "herald"):
		return "coat_of_arms"
	case strings.Contains(hay, "beast") || strings.Contains(hay, "dragon") || strings.Contains(hay, "creature"):
		return "bestiary_creature"
	case strings.Contains(hay, "flower") || strings.Contains(hay, "forest") || strings.Contains(hay, "garden"):
		return "botanical_marginalia"
	case strings.Contains(hay, "crown") || strings.Contains(hay, "sword") || strings.Contains(hay, "relic"):
		return "relic_study"
	}
	return fallbackTypes[idx%len(fallbackTypes)]
}

func plainText(md string) string {
	r := md
	// strip fenced code blocks
	for {
		s := strings.Index(r, "```")
		if s < 0 {
			break
		}
		e := strings.Index(r[s+3:], "```")
		if e < 0 {
			break
		}
		r = r[:s] + " " + r[s+3+e+3:]
	}
	r = strings.NewReplacer("#", " ", ">", " ", "*", " ", "_", " ", "`", " ", "[", " ", "]", " ", "(", " ", ")", " ", "-", " ").Replace(r)
	return strings.Join(strings.Fields(r), " ")
}

// --- restore source bodies -----------------------------------------------

// restoreSourceBodies replaces the AI-echoed excerpt with the real full
// BodyMarkdown from the source. This is the "never rewrite prose" guarantee.
func restoreSourceBodies(plan Plan, norm NormalizedMarkdown) Plan {
	byID := make(map[string]string, len(norm.Sections))
	for _, s := range norm.Sections {
		byID[s.ID] = s.BodyMarkdown
	}
	sections := make([]Section, len(plan.Sections))
	for i, s := range plan.Sections {
		if body, ok := byID[s.ID]; ok {
			s.BodyMarkdown = body
		}
		sections[i] = s
	}
	return Plan{Title: plan.Title, Subtitle: plan.Subtitle, Style: plan.Style, Sections: sections}
}
