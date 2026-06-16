package api

import (
	"strings"
	"testing"
)

func TestBodyStripsLeakedHeadingMarkers(t *testing.T) {
	for _, in := range []string{
		"###Полное и Достоверное Описание",
		"### Полное и Достоверное Описание", // valid heading -> not a body paragraph
		"#### Полное",
	} {
		blocks := markdownToManuscriptBlocks(in, true, generationSettings{FontSize: 20})
		for _, b := range blocks {
			if strings.Contains(b.HTML, "#") {
				t.Errorf("rendered HTML still contains '#': input=%q html=%s", in, b.HTML)
			}
		}
	}
}
