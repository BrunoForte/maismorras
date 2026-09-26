package tokens

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"vtt-backend/internal/apperror"
)

const cloudflareAPIBaseURL = "https://api.cloudflare.com/client/v4/accounts"

type CloudflareService struct {
	client       *http.Client
	baseURL      string
	accountID    string
	apiToken     string
	model        string
	maxImageSize int64
}

func NewCloudflareService(client *http.Client, accountID, apiToken, model string, maxImageSize int64) *CloudflareService {
	if maxImageSize <= 0 {
		maxImageSize = 5 * 1024 * 1024
	}
	return &CloudflareService{
		client: client, baseURL: cloudflareAPIBaseURL, accountID: strings.TrimSpace(accountID), apiToken: strings.TrimSpace(apiToken),
		model: strings.TrimSpace(model), maxImageSize: maxImageSize,
	}
}

func (s *CloudflareService) Generate(ctx context.Context, prompt string) (string, error) {
	return s.generate(ctx, prompt+promptSuffix)
}

func (s *CloudflareService) GenerateMap(ctx context.Context, prompt string) (string, error) {
	return s.generate(ctx, mapPromptPrefix+prompt+mapPromptSuffix)
}

func (s *CloudflareService) generate(ctx context.Context, prompt string) (string, error) {
	if s.accountID == "" || s.apiToken == "" || s.model == "" {
		return "", apperror.ServiceUnavailable("A geração de imagens não está configurada no servidor.")
	}
	body, err := json.Marshal(map[string]any{"prompt": prompt, "steps": 4})
	if err != nil {
		return "", apperror.Internal(err)
	}
	endpoint := fmt.Sprintf("%s/%s/ai/run/%s", s.baseURL, s.accountID, s.model)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(body)))
	if err != nil {
		return "", apperror.Internal(err)
	}
	req.Header.Set("Authorization", "Bearer "+s.apiToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		if ctx.Err() != nil || errors.Is(err, context.DeadlineExceeded) {
			return "", apperror.ServiceUnavailable("O provedor de imagens demorou demais para responder.")
		}
		return "", apperror.BadGateway(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		if resp.StatusCode == http.StatusTooManyRequests {
			return "", apperror.TooManyRequests("UPSTREAM_RATE_LIMITED", "O limite diário gratuito de geração foi atingido. Tente novamente após a renovação da cota.")
		}
		return "", apperror.BadGateway(fmt.Errorf("Cloudflare Workers AI returned status %d", resp.StatusCode))
	}
	encodedLimit := base64.StdEncoding.EncodedLen(int(s.maxImageSize+1)) + 16*1024
	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, int64(encodedLimit)))
	if err != nil {
		return "", apperror.BadGateway(err)
	}
	var decoded struct {
		Success bool `json:"success"`
		Result  struct {
			Image string `json:"image"`
		} `json:"result"`
	}
	if err := json.Unmarshal(responseBody, &decoded); err != nil || !decoded.Success || decoded.Result.Image == "" {
		return "", apperror.BadGateway(fmt.Errorf("Cloudflare Workers AI returned an invalid image response"))
	}
	imageBytes, err := base64.StdEncoding.DecodeString(decoded.Result.Image)
	if err != nil {
		return "", apperror.BadGateway(fmt.Errorf("Cloudflare Workers AI returned invalid image data"))
	}
	if int64(len(imageBytes)) > s.maxImageSize {
		return "", apperror.BadGateway(fmt.Errorf("upstream image exceeded %d byte limit", s.maxImageSize))
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(imageBytes), nil
}
