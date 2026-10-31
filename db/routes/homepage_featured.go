package routes

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
)

const homepageMaxItems = 12
const homepageMaxRevision int64 = 9007199254740991

var homepageTrailID = regexp.MustCompile(`^[a-zA-Z0-9]{15}$`)

type homepageFeaturedReason struct {
	EN string `json:"en"`
	ZH string `json:"zh"`
}
type homepageFeaturedItem struct {
	ID     string                  `json:"id"`
	Reason *homepageFeaturedReason `json:"reason,omitempty"`
}
type homepageFeaturedDocument struct {
	Revision int64                  `json:"revision"`
	Items    []homepageFeaturedItem `json:"items"`
}

// Keep exact machine-readable messages: PocketBase's NewApiError normally
// sentence-cases messages, which would make Web localization keys unstable.
func homepageAPIError(status int, code string) error {
	return &router.ApiError{Status: status, Message: code, Data: map[string]any{"code": code}}
}
func homepageUnavailable(e *core.RequestEvent, err error) error {
	e.App.Logger().Error("Homepage featured operation failed", "error", err)
	return homepageAPIError(http.StatusServiceUnavailable, "homepage_unavailable")
}
func homepageCacheHeaders(e *core.RequestEvent, private bool) {
	value := "no-store"
	if private {
		value = "private, no-store"
	}
	e.Response.Header().Set("Cache-Control", value)
	e.Response.Header().Set("Vary", "Authorization, Cookie")
}

// A fresh membership read is authoritative. No role supplied by the Web,
// account profile, or bearer payload grants homepage management access.
func canManageHomepage(app core.App, auth *core.Record) (bool, error) {
	if auth == nil {
		return false, nil
	}
	if auth.IsSuperuser() {
		return true, nil
	}
	if auth.Collection().Name != "users" {
		return false, nil
	}
	editors, err := app.FindCachedCollectionByNameOrId("homepage_editors")
	if err != nil {
		return false, err
	}
	_, err = app.FindFirstRecordByFilter(editors, "user = {:user}", dbx.Params{"user": auth.Id})
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}
func requireHomepageEditor(e *core.RequestEvent, app core.App) error {
	if e.Auth == nil {
		return homepageAPIError(http.StatusUnauthorized, "homepage_auth_required")
	}
	allowed, err := canManageHomepage(app, e.Auth)
	if err != nil {
		return homepageUnavailable(e, err)
	}
	if !allowed {
		return homepageAPIError(http.StatusForbidden, "homepage_editor_required")
	}
	return nil
}

func HomepageEditor(e *core.RequestEvent) error {
	homepageCacheHeaders(e, true)
	allowed, err := canManageHomepage(e.App, e.Auth)
	if err != nil {
		return homepageUnavailable(e, err)
	}
	return e.JSON(http.StatusOK, map[string]bool{"canManageHomepage": allowed})
}

func readHomepageFeatured(app core.App) (*core.Record, homepageFeaturedDocument, error) {
	record, err := app.FindFirstRecordByFilter("homepage_featured", "key = {:key}", dbx.Params{"key": "homepage"})
	if err != nil {
		return nil, homepageFeaturedDocument{}, err
	}
	document := homepageFeaturedDocument{Revision: int64(record.GetInt("revision"))}
	if err := record.UnmarshalJSONField("items", &document.Items); err != nil {
		return nil, document, err
	}
	if document.Revision < 0 || document.Revision > homepageMaxRevision || document.Items == nil {
		return nil, document, fmt.Errorf("invalid homepage featured document")
	}
	if err := validateHomepageItems(document.Items); err != nil {
		return nil, document, err
	}
	return record, document, nil
}

func HomepageFeaturedAdminGet(e *core.RequestEvent) error {
	homepageCacheHeaders(e, true)
	if err := requireHomepageEditor(e, e.App); err != nil {
		return err
	}
	_, document, err := readHomepageFeatured(e.App)
	if err != nil {
		return homepageUnavailable(e, err)
	}
	return e.JSON(http.StatusOK, document)
}

func validateHomepageItems(items []homepageFeaturedItem) error {
	if len(items) > homepageMaxItems {
		return homepageAPIError(http.StatusBadRequest, "homepage_too_many_items")
	}
	seen := make(map[string]bool, len(items))
	for _, item := range items {
		if !homepageTrailID.MatchString(item.ID) {
			return homepageAPIError(http.StatusBadRequest, "homepage_invalid_trail")
		}
		if seen[item.ID] {
			return homepageAPIError(http.StatusBadRequest, "homepage_duplicate_trail")
		}
		seen[item.ID] = true
		if item.Reason != nil && (utf8.RuneCountInString(item.Reason.EN) > 240 || utf8.RuneCountInString(item.Reason.ZH) > 240) {
			return homepageAPIError(http.StatusBadRequest, "homepage_invalid_reason")
		}
	}
	return nil
}

// Both the route and its author must be accessible without any auth or share
// query. In particular the caller's ownership or share token is never reused.
func homepageTrailEligible(app core.App, id string) (bool, error) {
	trails, err := app.FindCachedCollectionByNameOrId("trails")
	if err != nil {
		return false, err
	}
	trail, err := app.FindRecordById(trails, id)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if !trail.GetBool("public") || strings.TrimSpace(trail.GetString("name")) == "" {
		return false, nil
	}
	anonymous := &core.RequestInfo{Auth: nil, Query: map[string]string{}}
	allowed, err := app.CanAccessRecord(trail, anonymous, trail.Collection().ViewRule)
	if err != nil || !allowed {
		return false, err
	}
	authorID := trail.GetString("author")
	if authorID == "" {
		return false, nil
	}
	authors, err := app.FindCachedCollectionByNameOrId("activitypub_actors")
	if err != nil {
		return false, err
	}
	author, err := app.FindRecordById(authors, authorID)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if strings.TrimSpace(author.GetString("preferred_username")) == "" || (!author.GetBool("is_local") && strings.TrimSpace(author.GetString("domain")) == "") {
		return false, nil
	}
	return app.CanAccessRecord(author, anonymous, author.Collection().ViewRule)
}

func HomepageFeaturedAdminPut(e *core.RequestEvent) error {
	homepageCacheHeaders(e, true)
	if err := requireHomepageEditor(e, e.App); err != nil {
		return err
	}
	var body struct {
		Revision *int64                 `json:"revision"`
		Items    []homepageFeaturedItem `json:"items"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(e.Response, e.Request.Body, 32768))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil {
		return homepageAPIError(http.StatusBadRequest, "homepage_invalid_request")
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		return homepageAPIError(http.StatusBadRequest, "homepage_invalid_request")
	}
	if body.Revision == nil || *body.Revision < 0 || *body.Revision >= homepageMaxRevision {
		return homepageAPIError(http.StatusBadRequest, "homepage_invalid_revision")
	}
	if body.Items == nil {
		return homepageAPIError(http.StatusBadRequest, "homepage_invalid_request")
	}
	if err := validateHomepageItems(body.Items); err != nil {
		return err
	}
	var saved homepageFeaturedDocument
	err := e.App.RunInTransaction(func(tx core.App) error {
		// Recheck grants in the same transaction as the write so a revoked
		// editor cannot rely on the earlier presentation/authorization check.
		if err := requireHomepageEditor(e, tx); err != nil {
			return err
		}
		record, current, err := readHomepageFeatured(tx)
		if err != nil {
			return homepageUnavailable(e, err)
		}
		if current.Revision != *body.Revision {
			return homepageAPIError(http.StatusConflict, "homepage_revision_conflict")
		}
		for _, item := range body.Items {
			allowed, err := homepageTrailEligible(tx, item.ID)
			if err != nil {
				return homepageUnavailable(e, err)
			}
			if !allowed {
				return homepageAPIError(http.StatusBadRequest, "homepage_invalid_trail")
			}
		}
		saved = homepageFeaturedDocument{Revision: current.Revision + 1, Items: body.Items}
		record.Set("items", saved.Items)
		record.Set("revision", saved.Revision)
		if err := tx.Save(record); err != nil {
			return homepageUnavailable(e, err)
		}
		return nil
	})
	if err != nil {
		var apiError *router.ApiError
		if errors.As(err, &apiError) {
			return err
		}
		return homepageUnavailable(e, err)
	}
	return e.JSON(http.StatusOK, saved)
}

func HomepageFeatured(e *core.RequestEvent) error {
	homepageCacheHeaders(e, false)
	_, document, err := readHomepageFeatured(e.App)
	if err != nil {
		return homepageUnavailable(e, err)
	}
	visible := make([]homepageFeaturedItem, 0, len(document.Items))
	for _, item := range document.Items {
		allowed, err := homepageTrailEligible(e.App, item.ID)
		if err != nil {
			return homepageUnavailable(e, err)
		}
		if allowed {
			visible = append(visible, item)
		}
	}
	return e.JSON(http.StatusOK, map[string]any{"items": visible})
}
