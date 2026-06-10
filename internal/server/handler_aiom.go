package server

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const defaultAIOMBase = "https://aiometadata.elfhosted.com"

// normalizeAIOMOrigin validates and strips a base URL down to its origin.
func normalizeAIOMOrigin(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return defaultAIOMBase, nil
	}
	u, err := url.Parse(trimmed)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", errors.New("AIOMetadata base URL must be a valid http or https URL")
	}
	return u.Scheme + "://" + u.Host, nil
}

// registerAIOMRoutes mounts the AIOMetadata one-click install proxy.
// The browser can't reach arbitrary AIOM instances cross-origin, so the
// server performs the load → merge → update sequence on its behalf.
func registerAIOMRoutes(mux *http.ServeMux) {
	client := &http.Client{Timeout: 20 * time.Second}

	mux.HandleFunc("/api/aiometadata/install", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "read body", http.StatusBadRequest)
			return
		}
		var req struct {
			BaseURL                    string `json:"baseUrl"`
			UserUUID                   string `json:"userUUID"`
			Password                   string `json:"password"`
			AddonPassword              string `json:"addonPassword"`
			PosterURLPattern           string `json:"posterUrlPattern"`
			BackgroundURLPattern       string `json:"backgroundUrlPattern"`
			LogoURLPattern             string `json:"logoUrlPattern"`
			EpisodeThumbnailURLPattern string `json:"episodeThumbnailUrlPattern"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}

		base, err := normalizeAIOMOrigin(req.BaseURL)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		req.UserUUID = strings.TrimSpace(req.UserUUID)
		if req.UserUUID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "AIOMetadata UUID is required"})
			return
		}
		if req.Password == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "AIOMetadata profile password is required"})
			return
		}
		if req.PosterURLPattern == "" && req.BackgroundURLPattern == "" &&
			req.LogoURLPattern == "" && req.EpisodeThumbnailURLPattern == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "at least one XRDB URL pattern is required"})
			return
		}

		auth := map[string]any{"password": req.Password}
		if req.AddonPassword != "" {
			auth["addonPassword"] = req.AddonPassword
		}

		// 1. Load the user's current AIOM config.
		loadBody, _ := json.Marshal(auth)
		loadResp, err := client.Post(
			base+"/api/config/load/"+url.PathEscape(req.UserUUID),
			"application/json", bytes.NewReader(loadBody),
		)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "could not reach the AIOMetadata instance"})
			return
		}
		defer loadResp.Body.Close()
		var loadJSON struct {
			Success bool            `json:"success"`
			Error   string          `json:"error"`
			Config  json.RawMessage `json:"config"`
		}
		_ = json.NewDecoder(io.LimitReader(loadResp.Body, 4<<20)).Decode(&loadJSON)
		if loadResp.StatusCode != http.StatusOK || !loadJSON.Success || len(loadJSON.Config) == 0 {
			msg := loadJSON.Error
			if msg == "" {
				msg = "failed to load the AIOMetadata profile"
			}
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": msg})
			return
		}

		// 2. Merge XRDB custom-art patterns into the config.
		var cfgMap map[string]any
		if err := json.Unmarshal(loadJSON.Config, &cfgMap); err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "unexpected AIOMetadata config shape"})
			return
		}
		cfgMap["posterRatingProvider"] = "custom"
		cfgMap["customPosterUrlPattern"] = req.PosterURLPattern
		cfgMap["customBackgroundUrlPattern"] = req.BackgroundURLPattern
		cfgMap["customLogoUrlPattern"] = req.LogoURLPattern
		cfgMap["customThumbnailUrlPattern"] = req.EpisodeThumbnailURLPattern

		// 3. Write it back.
		updatePayload := map[string]any{"config": cfgMap}
		for k, v := range auth {
			updatePayload[k] = v
		}
		updateBody, _ := json.Marshal(updatePayload)
		updateReq, _ := http.NewRequestWithContext(r.Context(), http.MethodPut,
			base+"/api/config/update/"+url.PathEscape(req.UserUUID), bytes.NewReader(updateBody))
		updateReq.Header.Set("Content-Type", "application/json")
		updateResp, err := client.Do(updateReq)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "could not reach the AIOMetadata instance"})
			return
		}
		defer updateResp.Body.Close()
		var updateJSON struct {
			Success    bool   `json:"success"`
			Error      string `json:"error"`
			InstallURL string `json:"installUrl"`
		}
		_ = json.NewDecoder(io.LimitReader(updateResp.Body, 1<<20)).Decode(&updateJSON)
		if updateResp.StatusCode != http.StatusOK || !updateJSON.Success {
			msg := updateJSON.Error
			if msg == "" {
				msg = "failed to update the AIOMetadata profile"
			}
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": msg})
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{
			"installUrl": updateJSON.InstallURL,
			"message":    "AIOMetadata profile updated with XRDB artwork patterns",
		})
	})
}
