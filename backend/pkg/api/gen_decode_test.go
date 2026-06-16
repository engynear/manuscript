package api

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGenerationRequestDecodesFrontendPayload(t *testing.T) {
	// Mirrors frontend { markdown, settings: $settings } with full ManuscriptSettings.
	payload := `{"markdown":"# Hi","settings":{"imageLimit":4,"chapterStart":"newPage","pageSize":"a4","paper":"/p.png","ornament":"/o.png","divider":"/d.png","titleDivider":"/td.png","dropcap":"/dc.png","fontStyle":"garamond","fontSize":20}}`
	r := httptest.NewRequest("POST", "/api/generate", strings.NewReader(payload))
	var req generationRequest
	if err := decodeJSON(r, &req); err != nil {
		t.Fatalf("decode failed (would be HTTP 400): %v", err)
	}
	if req.Markdown != "# Hi" || req.Settings.PageSize != "a4" {
		t.Fatalf("unexpected decode: %+v", req)
	}
}
