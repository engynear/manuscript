package auth

import (
	"testing"

	"github.com/google/uuid"
)

func TestPasswordHashRoundTrip(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if !CheckPassword(hash, "correct horse battery staple") {
		t.Fatal("expected password to match")
	}
	if CheckPassword(hash, "wrong password") {
		t.Fatal("expected wrong password to fail")
	}
}

func TestJWTRoundTrip(t *testing.T) {
	m := NewManager("test-secret")
	id := uuid.New()
	token, err := m.Issue(id)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	got, err := m.Verify(token)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if got != id {
		t.Fatalf("expected %s, got %s", id, got)
	}
}

func TestJWTRejectsWrongSecret(t *testing.T) {
	issuer := NewManager("secret-a")
	verifier := NewManager("secret-b")
	token, _ := issuer.Issue(uuid.New())
	if _, err := verifier.Verify(token); err == nil {
		t.Fatal("expected verification to fail with wrong secret")
	}
}
