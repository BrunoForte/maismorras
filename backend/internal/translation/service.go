package translation

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// Service keeps generative translation behind the API. The browser never sees
// the provider secret and callers can explicitly identify its output as AI-made.
type Service struct {
	client *http.Client
	url    string
	apiKey string
	model  string
}

func NewService(client *http.Client, url, apiKey, model string) *Service {
	return &Service{client: client, url: strings.TrimSpace(url), apiKey: strings.TrimSpace(apiKey), model: strings.TrimSpace(model)}
}

func (s *Service) Enabled() bool { return s.url != "" && s.apiKey != "" && s.model != "" }

func (s *Service) Translate(ctx context.Context, fields map[string]string) (map[string]string, error) {
	if !s.Enabled() {
		return nil, ErrNotConfigured
	}
	if len(fields) == 0 {
		return map[string]string{}, nil
	}
	input, err := json.Marshal(fields)
	if err != nil {
		return nil, fmt.Errorf("encode translation fields: %w", err)
	}
	prompt := "Translate the JSON object values from English to Brazilian Portuguese for a tabletop RPG compendium. Keep every JSON key exactly unchanged. Preserve dice notation, numbers, game mechanics, proper names when appropriate, and Markdown/URLs. Return ONLY a valid JSON object with the identical keys and translated string values. Do not add explanation.\n\n" + string(input)
	body, err := json.Marshal(map[string]any{
		"model":       s.model,
		"temperature": 0.1,
		"messages": []map[string]string{
			{"role": "system", "content": "You are a precise game-rules translator. Never invent, omit, or alter mechanics."},
			{"role": "user", "content": prompt},
		},
		"response_format": map[string]string{"type": "json_object"},
	})
	if err != nil {
		return nil, fmt.Errorf("encode translation request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create translation request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; MaisMorras/1.0)")
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("translation provider request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("translation provider returned status %d", resp.StatusCode)
	}
	var decoded struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, 256<<10))
	if err != nil {
		return nil, fmt.Errorf("read translation response: %w", err)
	}
	if err = json.Unmarshal(responseBody, &decoded); err != nil {
		return nil, fmt.Errorf("decode translation response: %w", err)
	}
	if len(decoded.Choices) == 0 || strings.TrimSpace(decoded.Choices[0].Message.Content) == "" {
		return nil, fmt.Errorf("translation provider returned no content")
	}
	var translated map[string]string
	if err = json.Unmarshal([]byte(decoded.Choices[0].Message.Content), &translated); err != nil {
		return nil, fmt.Errorf("translation provider returned invalid JSON: %w", err)
	}
	if len(translated) != len(fields) {
		return nil, fmt.Errorf("translation provider returned an incomplete field set")
	}
	for key := range fields {
		// PostgreSQL JSONB cannot store U+0000. Some translation responses
		// occasionally include it in generated text; remove it before the
		// repository serializes the translation for persistence.
		translated[key] = strings.ReplaceAll(translated[key], "\x00", "")
		if strings.TrimSpace(translated[key]) == "" {
			return nil, fmt.Errorf("translation provider returned an empty translation for %q", key)
		}
	}
	return translated, nil
}
