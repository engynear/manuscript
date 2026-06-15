package forge

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Client is a minimal OpenAI REST client using stdlib net/http.
//
// All calls use Server-Sent Events streaming (stream:true). This is required
// here because the network path to api.openai.com kills idle connections at
// ~30s; streaming keeps data flowing continuously so long generations survive.
type Client struct {
	apiKey       string
	planModel    string
	imageModel   string
	imageQuality string
	http         *http.Client
}

func NewClient(apiKey, planModel, imageModel, imageQuality string) *Client {
	return &Client{
		apiKey:       apiKey,
		planModel:    planModel,
		imageModel:   imageModel,
		imageQuality: imageQuality,
		http:         &http.Client{Timeout: 10 * time.Minute},
	}
}

// GeneratePlan calls the Responses API (streaming) with a JSON-schema output
// format and returns the accumulated output_text. Port of lib/generatePlan.ts:40.
func (c *Client) GeneratePlan(ctx context.Context, systemPrompt, userPrompt string, schema map[string]any) (string, error) {
	body := map[string]any{
		"model":  c.planModel,
		"stream": true,
		"input": []map[string]any{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userPrompt},
		},
		"text": map[string]any{
			"format": map[string]any{
				"type":   "json_schema",
				"name":   "manuscript_plan",
				"schema": schema,
				"strict": true,
			},
		},
	}

	var sb strings.Builder
	err := c.stream(ctx, "https://api.openai.com/v1/responses", body, func(ev map[string]any) {
		switch ev["type"] {
		case "response.output_text.delta":
			if d, ok := ev["delta"].(string); ok {
				sb.WriteString(d)
			}
		}
	})
	if err != nil {
		return "", err
	}
	return sb.String(), nil
}

// GenerateImage calls the Images API (streaming) and returns raw PNG bytes.
// partial_images keeps the connection active during the long render.
// Port of lib/generateImages.ts:143.
func (c *Client) GenerateImage(ctx context.Context, prompt, size string) ([]byte, error) {
	body := map[string]any{
		"model":          c.imageModel,
		"prompt":         prompt,
		"size":           size,
		"background":     "transparent",
		"output_format":  "png",
		"quality":        c.imageQuality,
		"stream":         true,
		"partial_images": 2,
	}

	var b64 string
	err := c.stream(ctx, "https://api.openai.com/v1/images/generations", body, func(ev map[string]any) {
		// Both partial_image and completed events carry b64_json; the final
		// (completed) event overwrites partials with the full image.
		if v, ok := ev["b64_json"].(string); ok && v != "" {
			b64 = v
		}
	})
	if err != nil {
		return nil, err
	}
	if b64 == "" {
		return nil, fmt.Errorf("openai images: no image data in stream")
	}
	return base64.StdEncoding.DecodeString(b64)
}

// stream POSTs body and reads an SSE response, invoking onEvent for each parsed
// `data:` JSON object. It surfaces error events and non-2xx responses.
func (c *Client) stream(ctx context.Context, url string, body any, onEvent func(map[string]any)) error {
	b, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")

	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("openai request: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode >= 400 {
		raw, _ := io.ReadAll(res.Body)
		return fmt.Errorf("openai %s: status %d: %s", url, res.StatusCode, raw)
	}

	scanner := bufio.NewScanner(res.Body)
	scanner.Buffer(make([]byte, 0, 1024*1024), 16*1024*1024) // images can emit large b64 chunks
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" || data == "[DONE]" {
			continue
		}
		var ev map[string]any
		if err := json.Unmarshal([]byte(data), &ev); err != nil {
			continue
		}
		if t, _ := ev["type"].(string); t == "error" || t == "response.failed" {
			return fmt.Errorf("openai stream error: %s", data)
		}
		onEvent(ev)
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("openai stream read: %w", err)
	}
	return nil
}
