package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		return app.RunInTransaction(func(tx core.App) error {
			users, err := tx.FindCollectionByNameOrId("users")
			if err != nil {
				return err
			}
			editors := core.NewBaseCollection("homepage_editors")
			// Nil rules deliberately lock every native record API to PB superusers.
			editors.ListRule, editors.ViewRule = nil, nil
			editors.CreateRule, editors.UpdateRule, editors.DeleteRule = nil, nil, nil
			editors.Fields.Add(
				&core.RelationField{Name: "user", CollectionId: users.Id, Required: true, MaxSelect: 1, CascadeDelete: true},
				&core.AutodateField{Name: "created", OnCreate: true},
				&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
			)
			editors.Indexes = []string{"CREATE UNIQUE INDEX idx_homepage_editors_user ON homepage_editors (user)"}
			if err := tx.Save(editors); err != nil {
				return err
			}

			featured := core.NewBaseCollection("homepage_featured")
			featured.ListRule, featured.ViewRule = nil, nil
			featured.CreateRule, featured.UpdateRule, featured.DeleteRule = nil, nil, nil
			featured.Fields.Add(
				&core.TextField{Name: "key", Required: true, Min: 8, Max: 8, Pattern: "^homepage$"},
				// [] is a valid, intentional empty homepage; JSON Required would reject it.
				&core.JSONField{Name: "items", MaxSize: 32768},
				&core.NumberField{Name: "revision", OnlyInt: true, Min: types.Pointer(float64(0)), Max: types.Pointer(float64(9007199254740991))},
				&core.AutodateField{Name: "created", OnCreate: true},
				&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
			)
			featured.Indexes = []string{"CREATE UNIQUE INDEX idx_homepage_featured_key ON homepage_featured (key)"}
			if err := tx.Save(featured); err != nil {
				return err
			}
			initial := core.NewRecord(featured)
			initial.Set("key", "homepage")
			initial.Set("items", []any{})
			initial.Set("revision", 0)
			return tx.Save(initial)
		})
	}, func(app core.App) error {
		return app.RunInTransaction(func(tx core.App) error {
			for _, name := range []string{"homepage_featured", "homepage_editors"} {
				collection, err := tx.FindCollectionByNameOrId(name)
				if errors.Is(err, sql.ErrNoRows) {
					continue
				}
				if err != nil {
					return err
				}
				if err := tx.Delete(collection); err != nil {
					return err
				}
			}
			return nil
		})
	})
}
