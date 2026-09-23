package tokens

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"net/url"
	"strings"

	"vtt-backend/internal/apperror"
)

const promptSuffix = ", portrait, fantasy rpg avatar, highly detailed digital painting, plain background"
const mapPromptSuffix = ", mapa de batalha para D&D, visto exatamente de cima (visão ortográfica), sem perspectiva, sem inclinação e sem efeito isométrico; mantenha escala e proporções consistentes: cada quadrado da grade do jogo representa 1,5 m por 1,5 m; corredores, portas e objetos devem respeitar essa escala; não desenhe grade, coordenadas, texto, rótulos ou personagens, pois a grade será aplicada pelo jogo"

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
	return s.generate(ctx, prompt+promptSuffix, 256, 256)
}

func (s *PollinationsService) GenerateMap(ctx context.Context, prompt string) (string, error) {
	return s.generate(ctx, prompt+mapPromptSuffix, 1024, 1024)
}

func (s *PollinationsService) generate(ctx context.Context, fullPrompt string, width, height int) (string, error) {
	seed := rand.IntN(100001) // intervalo inclusivo: 0 a 100000
	endpoint := fmt.Sprintf("%s/prompt/%s?width=%d&height=%d&nologo=true&seed=%d", s.baseURL, url.PathEscape(fullPrompt), width, height, seed)

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
		if ctx.Err() != nil || errors.Is(err, context.DeadlineExceeded) {
			return "", apperror.ServiceUnavailable("O provedor de imagens demorou demais para responder.")
		}
		return "", apperror.BadGateway(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", classifyProviderError(resp.StatusCode, string(body))
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

func classifyProviderError(status int, body string) error {
	if status == http.StatusTooManyRequests {
		return apperror.TooManyRequests("UPSTREAM_RATE_LIMITED", "O provedor de imagens atingiu o limite de requisições. Tente novamente em instantes.")
	}
	lower := strings.ToLower(body)
	if (status == http.StatusBadRequest || status == http.StatusForbidden || status == http.StatusUnprocessableEntity) &&
		(strings.Contains(lower, "policy") || strings.Contains(lower, "safety") || strings.Contains(lower, "moderation") || strings.Contains(lower, "guideline") || strings.Contains(lower, "nsfw") || strings.Contains(lower, "blocked")) {
		return apperror.ImagePolicyBlocked()
	}
	return apperror.BadGateway(fmt.Errorf("image provider returned status %d", status))
}
