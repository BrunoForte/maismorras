package tokens

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"net/url"
	"strings"

	"vtt-backend/internal/apperror"
)

const promptSuffix = ", portrait, fantasy rpg avatar, highly detailed digital painting, plain background"

type ImageGenerator interface {
	Generate(ctx context.Context, prompt string) (string, error)
}

type PollinationsService struct {
	client       *http.Client
	baseURL      string
	maxImageSize int64
}

func NewPollinationsService(client *http.Client, baseURL string, maxImageSize int64) *PollinationsService {
	return &PollinationsService{client: client, baseURL: strings.TrimRight(baseURL, "/"), maxImageSize: maxImageSize}
}

func (s *PollinationsService) Generate(ctx context.Context, prompt string) (string, error) {
	fullPrompt := prompt + promptSuffix
	seed := rand.IntN(100001) // intervalo inclusivo: 0 a 100000
	endpoint := fmt.Sprintf("%s/prompt/%s?width=256&height=256&nologo=true&seed=%d", s.baseURL, url.PathEscape(fullPrompt), seed)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", apperror.Internal(err)
	}
	// Pollinations pode rejeitar clientes sem um User-Agent de navegador.
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; CustomVTT/1.0; +https://localhost)")
	// Prioriza PNG para manter consistente o MIME do data URL devolvido ao frontend.
	req.Header.Set("Accept", "image/png,image/*;q=0.9,*/*;q=0.8")

	resp, err := s.client.Do(req)
	if err != nil {
		return "", apperror.BadGateway(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", apperror.BadGateway(fmt.Errorf("pollinations returned status %d", resp.StatusCode))
	}

	// LimitReader mantém o download na RAM sob um teto. O +1 detecta respostas maiores
	// antes de convertê-las em Base64, cuja representação ocupa aproximadamente 4/3 dos bytes.
	imageBytes, err := io.ReadAll(io.LimitReader(resp.Body, s.maxImageSize+1))
	if err != nil {
		return "", apperror.BadGateway(err)
	}
	if int64(len(imageBytes)) > s.maxImageSize {
		return "", apperror.BadGateway(fmt.Errorf("upstream image exceeded %d byte limit", s.maxImageSize))
	}

	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(imageBytes), nil
}
