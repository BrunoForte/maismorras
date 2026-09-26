package translation

import "errors"

var ErrNotConfigured = errors.New("translation provider is not configured")
var ErrQuotaExceeded = errors.New("translation provider quota exceeded")
