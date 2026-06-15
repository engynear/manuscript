package forge

// Plan is the AI-produced manuscript plan. Field names/json tags mirror the
// frontend ManuscriptPlan type (frontend/src/lib/types.ts).
type Plan struct {
	Title    string    `json:"title"`
	Subtitle string    `json:"subtitle"`
	Style    string    `json:"style"`
	Sections []Section `json:"sections"`
}

type Section struct {
	ID              string        `json:"id"`
	Level           int           `json:"level"`
	OriginalHeading string        `json:"originalHeading"`
	DisplayHeading  string        `json:"displayHeading"`
	BodyMarkdown    string        `json:"bodyMarkdown"`
	DropCap         bool          `json:"dropCap"`
	Ornament        bool          `json:"ornament"`
	Illustration    *Illustration `json:"illustration"`
}

type Illustration struct {
	Type      string `json:"type"`
	Placement string `json:"placement"`
	Prompt    string `json:"prompt"`
	Caption   string `json:"caption"`
}

var IllustrationTypes = []string{
	"map", "coat_of_arms", "woodcut_engraving", "illuminated_miniature",
	"chapter_vignette", "marginalia_scene", "botanical_marginalia",
	"bestiary_creature", "relic_study", "scribal_diagram",
}

// planJSONSchema returns the OpenAI Structured Outputs schema (port of
// lib/manuscriptSchema.ts manuscriptPlanJsonSchema).
func planJSONSchema() map[string]any {
	illTypes := make([]any, len(IllustrationTypes))
	for i, t := range IllustrationTypes {
		illTypes[i] = t
	}
	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"title", "subtitle", "style", "sections"},
		"properties": map[string]any{
			"title":    map[string]any{"type": "string", "minLength": 1, "maxLength": 120},
			"subtitle": map[string]any{"type": "string", "maxLength": 180},
			"style":    map[string]any{"type": "string", "minLength": 1, "maxLength": 300},
			"sections": map[string]any{
				"type":     "array",
				"minItems": 1,
				"maxItems": 24,
				"items": map[string]any{
					"type":                 "object",
					"additionalProperties": false,
					"required": []string{
						"id", "level", "originalHeading", "displayHeading",
						"bodyMarkdown", "dropCap", "ornament", "illustration",
					},
					"properties": map[string]any{
						"id":              map[string]any{"type": "string", "minLength": 1, "maxLength": 80},
						"level":           map[string]any{"type": "integer", "minimum": 1, "maximum": 4},
						"originalHeading": map[string]any{"type": "string", "maxLength": 160},
						"displayHeading":  map[string]any{"type": "string", "minLength": 1, "maxLength": 160},
						"bodyMarkdown":    map[string]any{"type": "string"},
						"dropCap":         map[string]any{"type": "boolean"},
						"ornament":        map[string]any{"type": "boolean"},
						"illustration": map[string]any{
							"anyOf": []any{
								map[string]any{"type": "null"},
								map[string]any{
									"type":                 "object",
									"additionalProperties": false,
									"required":             []string{"type", "placement", "prompt", "caption"},
									"properties": map[string]any{
										"type":      map[string]any{"enum": illTypes},
										"placement": map[string]any{"enum": []any{"before", "after"}},
										"prompt":    map[string]any{"type": "string", "minLength": 20, "maxLength": 1200},
										"caption":   map[string]any{"type": "string", "minLength": 1, "maxLength": 180},
									},
								},
							},
						},
					},
				},
			},
		},
	}
}
