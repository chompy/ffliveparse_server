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
	"sync"
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
	lock *sync.Mutex
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
		lock: &sync.Mutex{},
	}, nil
}

// StoreUser - store user to database
func (d *DatabaseHandler) StoreUser(user *data.User) error {
	d.lock.Lock()
	defer d.lock.Unlock()
	res := d.conn.Save(user)
	return res.Error
}

// FetchUserFromID - fetch user with ID from database
func (d *DatabaseHandler) FetchUserFromID(userID int64) (data.User, error) {
	u := data.User{}
	res := d.conn.Where("id = ?", userID).First(&u)
	return u, res.Error
}

// FetchUserFromUploadKey - fetch user with upload key from database
func (d *DatabaseHandler) FetchUserFromUploadKey(uploadKey string) (data.User, error) {
	u := data.User{}
	res := d.conn.Where("upload_key = ?", uploadKey).First(&u)
	return u, res.Error
}

// FetchUserFromWebKey - fetch user with web key from database
func (d *DatabaseHandler) FetchUserFromWebKey(webKey string) (data.User, error) {
	u := data.User{}
	res := d.conn.Where("web_key = ?", webKey).First(&u)
	return u, res.Error
}

// FetchUserFromFFToolsUID - fetch user with fftools uid from database
func (d *DatabaseHandler) FetchUserFromFFToolsUID(uid string) (data.User, error) {
	u := data.User{}
	res := d.conn.Where("ff_tools_uid = ?", uid).First(&u)
	return u, res.Error
}

// StoreEncounter - store encounter to database
func (d *DatabaseHandler) StoreEncounter(encounter *data.Encounter) error {
	d.lock.Lock()
	defer d.lock.Unlock()
	res := d.conn.Save(encounter)
	return res.Error
}

// FetchEncounter - fetch encounter by UID
func (d *DatabaseHandler) FetchEncounter(encounterUID string) (data.Encounter, error) {
	e := data.Encounter{}
	res := d.conn.Where(&data.Encounter{UID: encounterUID}).First(&e)
	return e, res.Error
}

// buildUserEncountersQuery - build query for user encounters
func (d *DatabaseHandler) buildUserEncountersQuery(userID int64, start *time.Time, end *time.Time) *gorm.DB {
	res := d.conn.Model(&data.Encounter{}).Where("user_id = ?", userID).Limit(app.PastEncounterFetchLimit)
	if start != nil {
		res = res.Where("start_time >= ?", start)
	}
	if end != nil {
		res = res.Where("end_time <= ?", end)
	}
	res = res.Order("start_time DESC")
	return res
}

// FetchUserEncounters - fetch encounters for user
func (d *DatabaseHandler) FetchUserEncounters(userID int64, offset int, start *time.Time, end *time.Time) ([]data.Encounter, error) {
	e := make([]data.Encounter, 0)
	res := d.buildUserEncountersQuery(userID, start, end)
	res = res.Offset(offset)
	res = res.Find(&e)
	return e, res.Error
}

// CountUserEncounters - get number of user encounters
func (d *DatabaseHandler) CountUserEncounters(userID int64, start *time.Time, end *time.Time) (int, error) {
	count := 0
	res := d.buildUserEncountersQuery(userID, start, end)
	res = res.Count(&count)
	return count, res.Error
}

// StoreCombatants - store combatants to database
func (d *DatabaseHandler) StoreCombatants(combatants []*data.Combatant) error {
	d.lock.Lock()
	defer d.lock.Unlock()
	for index := range combatants {
		res := d.conn.Save(combatants[index])
		if res.Error != nil {
			return res.Error
		}
	}
	return nil
}

// FetchCombatantsForEncounter - fetch all combatants for an encounter
func (d *DatabaseHandler) FetchCombatantsForEncounter(encounterUID string) ([]data.Combatant, error) {
	c := make([]data.Combatant, 0)
	res := d.conn.Where("encounter_uid = ?", encounterUID).Find(&c)
	if res.Error != nil {
		return c, res.Error
	}
	// add player entry
	players := make([]data.Player, 0)
	playerIDs := make([]int32, 0)
	for index := range c {
		hasPlayer := false
		for pIndex := range playerIDs {
			if c[index].PlayerID == playerIDs[pIndex] {
				hasPlayer = true
			}
		}
		if hasPlayer {
			continue
		}
		playerIDs = append(playerIDs, c[index].PlayerID)
	}
	if len(playerIDs) > 0 {
		res = d.conn.Where(playerIDs).Find(&players)
	}
	for index := range players {
		for cIndex := range c {
			if players[index].ID == c[cIndex].PlayerID {
				c[cIndex].Player = players[index]
			}
		}
	}
	return c, res.Error
}

// CleanUpRoutine - perform clean up operations at regular interval
func (d *DatabaseHandler) CleanUpRoutine() {
	cleanUp := func() {
		d.lock.Lock()
		defer d.lock.Unlock()
		count := int64(0)
		// delete encounters older than EncounterDeleteDays days
		cleanUpDate := time.Now().Add((-app.EncounterDeleteDays * 24) * time.Hour)
		d.log.Start(fmt.Sprintf("Begin clean up. (Clean up encounters older than %s.)", cleanUpDate))
		res := d.conn.Where(
			"start_time < ?",
			cleanUpDate,
		).Delete(&data.Encounter{})
		if res.Error != nil {
			d.log.Error(res.Error)
			return
		}
		count += res.RowsAffected
		// delete all combatants older than EncounterDeleteDays days
		res = d.conn.Where(
			"time < ?",
			cleanUpDate,
		).Delete(&data.Combatant{})
		if res.Error != nil {
			d.log.Error(res.Error)
			return
		}
		count += res.RowsAffected
		// TODO clean up users that have never uploaded
		d.log.Finish(fmt.Sprintf("Finish clean up. (%d records removed.)", count))
	}
	cleanUp()
	for range time.Tick(time.Millisecond * app.CleanUpRoutineRate) {
		cleanUp()
	}
}
