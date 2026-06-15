package forge

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// GeneratedImage is the result for one section's illustration.
type GeneratedImage struct {
	SectionID string `json:"sectionId"`
	URL       string `json:"url"`
	Caption   string `json:"caption"`
	Failed    bool   `json:"failed"`
}

// ImageProgressEvent is emitted for each illustration attempt.
type ImageProgressEvent struct {
	Type      string `json:"type"` // image-cache | image-start | image-complete | image-failed
	SectionID string `json:"sectionId"`
	Index     int    `json:"index"`
	Total     int    `json:"total"`
}

// GenerateImages generates illustrations for every section in plan that has an
// Illustration, up to imageLimit. PNGs are saved under mediaDir/<hash>/<sectionId>.png
// and served at mediaBase/<hash>/<sectionId>.png.
// Port of lib/generateImages.ts (softenImageEdges is intentionally omitted — cosmetic).
func GenerateImages(
	ctx context.Context,
	client *Client,
	plan Plan,
	hash string,
	mediaDir, mediaBase string,
	imageLimit int,
	onProgress func(ImageProgressEvent),
) ([]GeneratedImage, error) {
	var targets []Section
	for _, s := range plan.Sections {
		if s.Illustration != nil && len(targets) < imageLimit {
			targets = append(targets, s)
		}
	}

	jobDir := filepath.Join(mediaDir, hash)
	if err := os.MkdirAll(jobDir, 0o755); err != nil {
		return nil, fmt.Errorf("images: mkdir %s: %w", jobDir, err)
	}

	results := make([]GeneratedImage, 0, len(targets))
	total := len(targets)

	for idx, sec := range targets {
		ill := sec.Illustration
		progressIdx := idx + 1
		fileName := sec.ID + ".png"
		filePath := filepath.Join(jobDir, fileName)
		publicURL := strings.TrimRight(mediaBase, "/") + "/" + hash + "/" + fileName

		// Cache hit.
		if _, err := os.Stat(filePath); err == nil {
			if onProgress != nil {
				onProgress(ImageProgressEvent{Type: "image-cache", SectionID: sec.ID, Index: progressIdx, Total: total})
			}
			results = append(results, GeneratedImage{
				SectionID: sec.ID, URL: publicURL, Caption: ill.Caption,
			})
			continue
		}

		if onProgress != nil {
			onProgress(ImageProgressEvent{Type: "image-start", SectionID: sec.ID, Index: progressIdx, Total: total})
		}

		prompt := ill.Prompt + "\n\nStyle constraints: " + manuscriptIllustrationStyle(ill.Type)
		size := imageSizeForType(ill.Type)

		png, err := client.GenerateImage(ctx, prompt, size)
		if err != nil {
			if onProgress != nil {
				onProgress(ImageProgressEvent{Type: "image-failed", SectionID: sec.ID, Index: progressIdx, Total: total})
			}
			results = append(results, GeneratedImage{SectionID: sec.ID, Caption: ill.Caption, Failed: true})
			continue
		}

		if err := os.WriteFile(filePath, png, 0o644); err != nil {
			if onProgress != nil {
				onProgress(ImageProgressEvent{Type: "image-failed", SectionID: sec.ID, Index: progressIdx, Total: total})
			}
			results = append(results, GeneratedImage{SectionID: sec.ID, Caption: ill.Caption, Failed: true})
			continue
		}

		if onProgress != nil {
			onProgress(ImageProgressEvent{Type: "image-complete", SectionID: sec.ID, Index: progressIdx, Total: total})
		}
		results = append(results, GeneratedImage{SectionID: sec.ID, URL: publicURL, Caption: ill.Caption})
	}
	return results, nil
}

func imageSizeForType(t string) string {
	switch t {
	case "map", "chapter_vignette", "scribal_diagram":
		return "1536x1024"
	case "coat_of_arms":
		return "1024x1536"
	}
	return "1024x1024"
}

// manuscriptIllustrationStyle returns the style constraint suffix for a prompt.
// Port of lib/generateImages.ts manuscriptIllustrationStyle.
func manuscriptIllustrationStyle(t string) string {
	base := "Transparent-background medieval manuscript cutout asset. Single isolated illustration only. Object extraction style. PNG alpha cutout. The background must be fully transparent, not beige, not parchment-colored, not off-white. Only visible pixels should be the artwork itself: medieval figures, creatures, heraldry, map ink, decorative foliage, relics, diagram marks, lapis blue, vermilion red, verdigris green, violet shadows, and worn gold ornament when relevant. Invisible forbidden elements: parchment, paper, page, manuscript sheet, backdrop, environment, sky, ground, vignette, beige texture, cream texture, glow, shadow box, border, frame, white margin, rectangular tile. Hand-drawn ink and faded watercolor with real color, not monochrome sepia. Soft broken paint edges dissolving directly into transparent alpha. No readable text, no letters, no modern objects."

	variants := map[string]string{
		"map":                   "Isolated fantasy cartography drawing only: coastlines, rivers, mountains, ruins, old roads, compass marks, torn-looking ink clusters, blue rivers and red route marks. No parchment map sheet, no labels, no rectangular map tile, no paper background. The map strokes and watercolor washes dissolve into transparent alpha.",
		"coat_of_arms":          "Isolated heraldic device only: shield, crest, symbolic beasts, plants, ribbons without text, worn gold leaf, aged red and lapis pigments. Transparent surroundings. No banner text, no square background, no parchment plaque.",
		"woodcut_engraving":     "Isolated woodcut engraving marks only with optional muted color washes: black hatching, brown ink, lapis blue shadows, aged red accents, medieval action or object scene. No rectangular plate, no printed paper, no background landscape block. Broken ink edges fade to transparent alpha.",
		"illuminated_miniature": "Illuminated marginalia asset. Small medieval miniature scene with figures, decorative foliage, and gold leaf ornament. Cutout artwork. Transparent alpha background. No parchment, paper, page, sheet, backdrop, sky, ground, vignette, beige texture, or glow.",
		"chapter_vignette":      "Horizontal ornamental cutout only: narrow scenic band, ink wash, small figures or symbolic objects, decorative flourishes at both ends. Transparent alpha around and between forms. No rectangular frame, no parchment strip, no background tile.",
		"marginalia_scene":      "Medieval marginalia cutout scene: tiny figures, monks, travelers, knights, fools, saints, or courtly silhouettes interacting with vines and gold ornament. Transparent alpha. No page, no ground plane, no scenery backdrop.",
		"botanical_marginalia":  "Botanical marginalia cutout: curling vines, acanthus leaves, berries, flowers, small illuminated buds, worn gold accents. Transparent alpha. No paper texture, no beige fill, no rectangular crop.",
		"bestiary_creature":     "Bestiary creature cutout: dragon, griffin, basilisk, lion, serpent, strange bird, or hybrid beast in medieval ink and faded watercolor, with optional foliage or gold leaf. Transparent alpha. No habitat, no sky, no ground.",
		"relic_study":           "Isolated medieval relic or artifact study: crown, key, chalice, sword, seal, astrolabe, lantern, book clasp, coin, or sacred object. Ink outline, muted pigments, worn gold. Transparent alpha. No table, no room, no parchment.",
		"scribal_diagram":       "Scribal diagram cutout: circular cosmology, alchemical marks, routes, constellation-like dots, measuring lines, ornamental geometry. Abstract marks only, no readable letters or labels, transparent alpha, no paper sheet.",
	}
	if v, ok := variants[t]; ok {
		return base + " " + v
	}
	return base
}
