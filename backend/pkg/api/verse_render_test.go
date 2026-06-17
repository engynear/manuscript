package api

import (
	"strings"
	"testing"
)

func TestVerseFenceRendersStanzas(t *testing.T) {
	body := "```verse\nПой, древний мир, когда держалась твердь,\nкогда с небес не падала ни смерть, —\n\nТот мир был горд, высок и не пуглив:\nтянулся ввысь, о бездне позабыв;\n```"
	blocks := markdownToManuscriptBlocks(body, true, generationSettings{FontSize: 20})
	joined := ""
	for _, b := range blocks {
		joined += b.HTML
	}
	if !strings.Contains(joined, `class="manuscript-verse"`) {
		t.Fatalf("expected manuscript-verse block, got: %s", joined)
	}
	if strings.Count(joined, `class="manuscript-stanza"`) != 2 {
		t.Errorf("expected 2 stanzas, got: %s", joined)
	}
	if !strings.Contains(joined, "твердь,<br>когда") {
		t.Errorf("expected preserved line break, got: %s", joined)
	}
	if strings.Contains(joined, "manuscript-dropcap-letter") {
		t.Errorf("verse must not get a drop cap: %s", joined)
	}
	if strings.Contains(joined, ">verse<") || strings.Contains(joined, "verse Пой") {
		t.Errorf("the word 'verse' leaked into output: %s", joined)
	}
}
