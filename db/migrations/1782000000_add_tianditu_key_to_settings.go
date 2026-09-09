package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("uavt73rsqcn1n13")
		if err != nil {
			return err
		}

		if collection.Fields.GetByName("tiandituKey") == nil {
			if err := collection.Fields.AddMarshaledJSONAt(len(collection.Fields), []byte(`{
			"autogeneratePattern": "",
			"hidden": false,
			"id": "tiandituKey",
			"max": 256,
			"min": 0,
			"name": "tiandituKey",
			"pattern": "",
			"presentable": false,
			"primaryKey": false,
			"required": false,
			"system": false,
			"type": "text"
			}`)); err != nil {
				return err
			}
		}

		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("uavt73rsqcn1n13")
		if err != nil {
			return err
		}

		if collection.Fields.GetByName("tiandituKey") != nil {
			collection.Fields.RemoveById("tiandituKey")
		}
		return app.Save(collection)
	})
}
