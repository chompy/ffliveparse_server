/*
This file is part of FFLiveParse.

FFLiveParse is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

FFLiveParse is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with FFLiveParse.  If not, see <https://www.gnu.org/licenses/>.
*/

package session

import (
	"fmt"
	"time"

	"../app"
	"../data"
	"github.com/jinzhu/gorm"
	_ "github.com/jinzhu/gorm/dialects/sqlite" // import sqlite3 driver
)

// DatabaseHandler - handles database access
type DatabaseHandler struct {
	conn *gorm.DB
	log  app.Logging
}

// NewDatabaseHandler - create new database handler + open database connection
func NewDatabaseHandler() (DatabaseHandler, error) {
	// connect
	db, err := gorm.Open("sqlite3", app.DatabasePath)
	if err != nil {
		return DatabaseHandler{}, err
	}
	// init
	res := db.AutoMigrate(&data.User{})
	if res.Error != nil {
		return DatabaseHandler{}, res.Error
	}
	res = db.AutoMigrate(&data.Encounter{})
	if res.Error != nil {
		return DatabaseHandler{}, res.Error
	}
	res = db.AutoMigrate(&data.Combatant{})
	if res.Error != nil {
		return DatabaseHandler{}, res.Error
	}
	res = db.AutoMigrate(&data.Player{})
	if res.Error != nil {
		return DatabaseHandler{}, res.Error
	}
	// return
	return DatabaseHandler{
		conn: db,
		log:  app.Logging{ModuleName: "STORAGE/DATABASE"},
	}, nil
}

// StoreUser - store user to database
func (d *DatabaseHandler) StoreUser(user *data.User) error {
	res := d.conn.Save(user)
	return res.Error
}

// FetchUserFromID - fetch user with ID from database
func (d *DatabaseHandler) FetchUserFromID(userID int64) (data.User, error) {
	u := data.User{}
	res := d.conn.First(&u, 1)
	return u, res.Error
}

// FetchUserFromUploadKey - fetch user with upload key from database
func (d *DatabaseHandler) FetchUserFromUploadKey(uploadKey string) (data.User, error) {
	u := data.User{}
	res := d.conn.Where("upload_key = ?", uploadKey).First(&u, 1)
	return u, res.Error
}

// FetchUserFromWebKey - fetch user with web key from database
func (d *DatabaseHandler) FetchUserFromWebKey(webKey string) (data.User, error) {
	u := data.User{}
	res := d.conn.Where("web_key = ?", webKey).First(&u, 1)
	return u, res.Error
}

// StoreEncounter - store encounter to database
func (d *DatabaseHandler) StoreEncounter(encounter *data.Encounter) error {
	res := d.conn.Save(encounter)
	return res.Error
}

// StoreCombatants - store combatants to database
func (d *DatabaseHandler) StoreCombatants(combatants []*data.Combatant) error {
	for index := range combatants {
		res := d.conn.Save(combatants[index])
		if res.Error != nil {
			return res.Error
		}
	}
	return nil
}

// StorePlayers - store players to database
func (d *DatabaseHandler) StorePlayers(players []*data.Player) error {
	for index := range players {
		res := d.conn.Save(players[index])
		if res.Error != nil {
			return res.Error
		}
	}
	return nil
}

// CleanUp - perform clean up operations
func (d *DatabaseHandler) CleanUp() error {
	count := int64(0)
	d.log.Start("Begin clean up.")
	// delete encounters older than EncounterDeleteDays days
	cleanUpDate := time.Now().Add(time.Duration(-app.EncounterDeleteDays*24) * time.Hour)
	res := d.conn.Delete(&data.Encounter{}).Where(
		"start_time < ?",
		cleanUpDate,
	)
	if res.Error != nil {
		return res.Error
	}
	count += res.RowsAffected
	// delete all combatants older than EncounterDeleteDays days
	res = d.conn.Delete(&data.Combatant{}).Where(
		"time < ?",
		cleanUpDate,
	)
	if res.Error != nil {
		return res.Error
	}
	count += res.RowsAffected
	// TODO clean up users that have never uploaded
	d.log.Finish(fmt.Sprintf("Finish clean up. (%d records removed.)", count))
	return nil
}
