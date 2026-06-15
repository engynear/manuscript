package forge

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

var errEmptyMarkdown = errors.New("please provide non-empty Markdown text")

// NormalizedSection is one heading-delimited chunk of the source markdown.
type NormalizedSection struct {
	ID              string
	Level           int
	OriginalHeading string
	BodyMarkdown    string
}

// NormalizedMarkdown holds the cleaned source and its sections.
type NormalizedMarkdown struct {
	Source   string
	Sections []NormalizedSection
}

var headingRe = regexp.MustCompile(`^(#{1,6})\s+(.*)$`)

// ContentHash returns the first 24 hex chars of SHA-256 of input,
// matching lib/generatePlan.ts contentHash so plan_cache keys align.
func ContentHash(input string) string {
	sum := sha256.Sum256([]byte(input))
	return hex.EncodeToString(sum[:])[:24]
}

// NormalizeMarkdown splits source on ATX headings. Port of lib/markdown.ts.
func NormalizeMarkdown(source string) (NormalizedMarkdown, error) {
	cleaned := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(source, "\r\n", "\n"), "\r", "\n"))
	if cleaned == "" {
		return NormalizedMarkdown{}, errEmptyMarkdown
	}

	lines := strings.Split(cleaned, "\n")

	type headPos struct {
		line  int
		depth int
		text  string
	}
	var heads []headPos
	for i, l := range lines {
		if m := headingRe.FindStringSubmatch(l); m != nil {
			heads = append(heads, headPos{i, len(m[1]), strings.TrimSpace(m[2])})
		}
	}

	if len(heads) == 0 {
		return NormalizedMarkdown{
			Source: cleaned,
			Sections: []NormalizedSection{{
				ID: "manuscript", Level: 1,
				OriginalHeading: "Manuscript", BodyMarkdown: cleaned,
			}},
		}, nil
	}

	sl := newSlugger()
	sections := make([]NormalizedSection, 0, len(heads))
	for idx, h := range heads {
		bodyStart := h.line + 1
		bodyEnd := len(lines)
		if idx+1 < len(heads) {
			bodyEnd = heads[idx+1].line
		}
		body := ""
		if bodyStart < bodyEnd {
			body = strings.TrimSpace(strings.Join(lines[bodyStart:bodyEnd], "\n"))
		}
		level := clamp(h.depth, 1, 4)
		orig := h.text
		if orig == "" {
			orig = fmt.Sprintf("Section %d", idx+1)
		}
		id := sl.slug(orig)
		if id == "" {
			id = fmt.Sprintf("section-%d", idx+1)
		}
		sections = append(sections, NormalizedSection{
			ID: id, Level: level, OriginalHeading: orig, BodyMarkdown: body,
		})
	}
	return NormalizedMarkdown{Source: cleaned, Sections: sections}, nil
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// slugger mirrors github-slugger: lowercase, strip non-word chars, spaces→hyphens,
// deduplicate with -1, -2, …
type slugger struct{ seen map[string]int }

func newSlugger() *slugger { return &slugger{seen: map[string]int{}} }

var reStripSlug = regexp.MustCompile(`[^\p{L}\p{N}\s-]+`)
var reSpaceSlug = regexp.MustCompile(`\s+`)

func (s *slugger) slug(value string) string {
	base := strings.ToLower(strings.TrimSpace(value))
	base = reStripSlug.ReplaceAllString(base, "")
	base = reSpaceSlug.ReplaceAllString(base, "-")
	base = strings.Trim(base, "-")
	if base == "" {
		return ""
	}
	if n, ok := s.seen[base]; ok {
		s.seen[base]++
		return fmt.Sprintf("%s-%d", base, n)
	}
	s.seen[base] = 1
	return base
}
