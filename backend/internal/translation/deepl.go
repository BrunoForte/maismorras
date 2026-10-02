package translation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
)

const deeplMaxRequestBytes = 100 << 10 // Keep comfortably below DeepL's 128 KiB request limit.
const deeplMaxTextsPerRequest = 40

type DeepLService struct {
	client *http.Client
	url    string
	apiKey string
}

func NewDeepLService(client *http.Client, endpoint, apiKey string) *DeepLService {
	return &DeepLService{client: client, url: strings.TrimSpace(endpoint), apiKey: strings.TrimSpace(apiKey)}
}

func (s *DeepLService) Enabled() bool { return s.url != "" && s.apiKey != "" }

func (s *DeepLService) ProviderName() string { return "deepl" }

type deepLRequest struct {
	Text               []string `json:"text"`
	SourceLang         string   `json:"source_lang"`
	TargetLang         string   `json:"target_lang"`
	PreserveFormatting bool     `json:"preserve_formatting"`
}

type deepLResponse struct {
	Translations []struct {
		Text string `json:"text"`
	} `json:"translations"`
}

// TranslateMissing sends only missing compendium fields to DeepL, preserving
// keys and making bounded requests so even entries with many rule fields fit.
func (s *DeepLService) Translate(ctx context.Context, fields map[string]string) (map[string]string, error) {
	if !s.Enabled() {
		return nil, ErrNotConfigured
	}
	if len(fields) == 0 {
		return map[string]string{}, nil
	}
	keys := make([]string, 0, len(fields))
	for key := range fields {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	translated := make(map[string]string, len(fields))
	for start := 0; start < len(keys); {
		end := start
		for end < len(keys) && end-start < deeplMaxTextsPerRequest {
			candidate := append(append([]string(nil), keys[start:end]...), keys[end])
			texts := make([]string, len(candidate))
			for i, key := range candidate {
				texts[i] = fields[key]
			}
			body, err := json.Marshal(deepLRequest{Text: texts, SourceLang: "EN", TargetLang: "PT-BR", PreserveFormatting: true})
			if err != nil {
				return nil, fmt.Errorf("encode DeepL request: %w", err)
			}
			if len(body) > deeplMaxRequestBytes {
				if end == start {
					return nil, fmt.Errorf("translation field %q exceeds DeepL request size limit", keys[end])
				}
				break
			}
			end++
		}
		batchKeys := keys[start:end]
		texts := make([]string, len(batchKeys))
		for i, key := range batchKeys {
			texts[i] = fields[key]
		}
		batch, err := s.translateBatch(ctx, texts)
		if err != nil {
			return nil, err
		}
		for i, key := range batchKeys {
			value := strings.ReplaceAll(batch[i], "\x00", "")
			if strings.TrimSpace(value) == "" {
				return nil, fmt.Errorf("DeepL returned an empty translation for field %q", key)
			}
			translated[key] = value
		}
		start = end
	}
	if err := ValidateTranslatedFields(fields, translated); err != nil {
		return nil, err
	}
	return translated, nil
}

func (s *DeepLService) translateBatch(ctx context.Context, texts []string) ([]string, error) {
	body, err := json.Marshal(deepLRequest{Text: texts, SourceLang: "EN", TargetLang: "PT-BR", PreserveFormatting: true})
	if err != nil {
		return nil, fmt.Errorf("encode DeepL request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create DeepL request: %w", err)
	}
	req.Header.Set("Authorization", "DeepL-Auth-Key "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, fmt.Errorf("%w: %v", ErrTimeout, err)
		}
		return nil, fmt.Errorf("%w: %v", ErrProviderUnavailable, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == 456 {
		return nil, ErrQuotaExceeded
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, ErrRateLimited
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		if resp.StatusCode >= http.StatusInternalServerError {
			return nil, ErrProviderUnavailable
		}
		return nil, fmt.Errorf("DeepL returned status %d", resp.StatusCode)
	}
	var decoded deepLResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 512<<10)).Decode(&decoded); err != nil {
		return nil, fmt.Errorf("decode DeepL response: %w", err)
	}
	if len(decoded.Translations) != len(texts) {
		return nil, fmt.Errorf("DeepL returned an incomplete translation batch")
	}
	result := make([]string, len(decoded.Translations))
	for i := range decoded.Translations {
		result[i] = decoded.Translations[i].Text
	}
	return result, nil
}
