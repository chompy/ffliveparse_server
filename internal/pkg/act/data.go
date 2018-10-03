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

package act

import (
	"database/sql"
	"log"
	"time"

	"github.com/martinlindhe/base36"

	"../app"
	"../user"
)

// lastUpdateInactiveTime - Time in ms between last data updata before data is considered inactive
const lastUpdateInactiveTime = 300000

// Data - data about an ACT session
type Data struct {
	Session     Session
	User        user.Data
	Encounter   Encounter
	Combatants  []Combatant
	LogLines    []LogLine
	LastUpdate  time.Time
	NewTickData bool
}

// NewData - create new ACT session data
func NewData(session Session, user user.Data) (Data, error) {
	database, err := getDatabase(user)
	if err != nil {
		return Data{}, err
	}
	err = initDatabase(database)
	if err != nil {
		return Data{}, err
	}
	database.Close()
	return Data{
		Session:    session,
		User:       user,
		Encounter:  Encounter{ID: 0},
		Combatants: make([]Combatant, 0),
		LastUpdate: time.Now(),
	}, nil
}

// UpdateEncounter - Add or update encounter data
func (d *Data) UpdateEncounter(encounter Encounter) {
	d.LastUpdate = time.Now()
	d.NewTickData = true
	// check if encounter update is for current counter
	// update it if so
	if encounter.ID == d.Encounter.ID {
		d.Encounter = encounter
		// save encounter if it is no longer active
		if !d.Encounter.Active {
			d.SaveEncounter()
		}
		return
	}
	// save + clear current encounter if one exists
	if d.Encounter.ID != 0 {
		err := d.SaveEncounter()
		if err != nil {
			log.Println("Error while saving encounter", d.Encounter.ID, err)
		}
		d.ClearEncounter()
	}
	// create new encounter
	d.Encounter = encounter
	log.Println("Set active encounter to", base36.Encode(uint64(uint32(encounter.ID))), "for session", d.User.ID)
}

// UpdateCombatant - Add or update combatant data
func (d *Data) UpdateCombatant(combatant Combatant) {
	d.LastUpdate = time.Now()
	d.NewTickData = true
	// ensure there is a current encounter and that data is for it
	if combatant.EncounterID == 0 || d.Encounter.ID == 0 || combatant.EncounterID != d.Encounter.ID {
		return
	}
	// look for existing, update if found
	for index, storedCombatant := range d.Combatants {
		if storedCombatant.Name == combatant.Name {
			d.Combatants[index] = combatant
			return
		}
	}
	// add new
	d.Combatants = append(d.Combatants, combatant)
	log.Println("Add combatant", combatant.Name, "to encounter", combatant.EncounterID, "(TotalCombatants:", len(d.Combatants), ")")
}

// UpdateLogLine - Add log line
func (d *Data) UpdateLogLine(logLine LogLine) {
	d.LastUpdate = time.Now()
	d.LogLines = append(d.LogLines, logLine)
}

// ClearLogLines - Clear log line buffer
func (d *Data) ClearLogLines() {
	d.LogLines = make([]LogLine, 0)
}

// getDatabase - get encounter database for given user
func getDatabase(user user.Data) (*sql.DB, error) {
	database, err := sql.Open("sqlite3", app.DataPath+"/act_"+user.GetWebIDString()+".db")
	if err != nil {
		return nil, err
	}
	return database, nil
}

// initDatabase - perform first time init of database
func initDatabase(database *sql.DB) error {
	// create encounter table if not exist
	stmt, err := database.Prepare(`
		CREATE TABLE IF NOT EXISTS encounter
		(
			id INTEGER PRIMARY KEY,
			start_time DATETIME,
			end_time DATETIME,
			zone VARCHAR(256),
			damage INTEGER,
			success_level INTEGER
		)
	`)
	if err != nil {
		return err
	}
	_, err = stmt.Exec()
	if err != nil {
		return err
	}
	// create combatant table if not exist
	stmt, err = database.Prepare(`
		CREATE TABLE IF NOT EXISTS combatant
		(
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			encounter_id INTEGER,
			name VARCHAR(256),
			job VARCHAR(3),
			damage INTEGER,
			damage_taken INTEGER,
			damage_healed INTEGER,
			deaths INTEGER,
			hits INTEGER,
			heals INTEGER,
			kills INTEGER,
			CONSTRAINT encounter_unique UNIQUE (encounter_id, name)
		)
	`)
	if err != nil {
		return err
	}
	_, err = stmt.Exec()
	if err != nil {
		return err
	}
	return nil
}

// SaveEncounter - save all data related to current encounter
func (d *Data) SaveEncounter() error {
	// no encounter
	if d.Encounter.ID == 0 {
		return nil
	}
	// get database
	database, err := getDatabase(d.User)
	if err != nil {
		return err
	}
	defer database.Close()
	// insert in to encounter table
	stmt, err := database.Prepare(`
		INSERT OR REPLACE INTO encounter
		(id, start_time, end_time, zone, damage, success_level) VALUES
		(?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	_, err = stmt.Exec(
		d.Encounter.ID,
		d.Encounter.StartTime,
		d.Encounter.EndTime,
		d.Encounter.Zone,
		d.Encounter.Damage,
		d.Encounter.SuccessLevel,
	)
	if err != nil {
		return err
	}
	stmt.Close()
	// insert in to combatant table
	for _, combatant := range d.Combatants {
		stmt, err := database.Prepare(`
			INSERT OR REPLACE INTO combatant
			(encounter_id, name, job, damage, damage_taken, damage_healed, deaths, hits, heals, kills) VALUES
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		if err != nil {
			return err
		}
		_, err = stmt.Exec(
			combatant.EncounterID,
			combatant.Name,
			combatant.Job,
			combatant.Damage,
			combatant.DamageTaken,
			combatant.DamageHealed,
			combatant.Deaths,
			combatant.Hits,
			combatant.Heals,
			combatant.Kills,
		)
		if err != nil {
			return err
		}
		stmt.Close()
	}
	return nil
}

// ClearEncounter - delete all data for current encounter from memory
func (d *Data) ClearEncounter() {
	d.Encounter = Encounter{ID: 0}
	d.Combatants = make([]Combatant, 0)
}

// GetPreviousEncounter - retrieve previous encounter data from database
func GetPreviousEncounter(user user.Data, encounterID int32) (Data, error) {
	// get database
	database, err := getDatabase(user)
	if err != nil {
		return Data{}, err
	}
	defer database.Close()
	// fetch encounter
	rows, err := database.Query(
		"SELECT * FROM encounter WHERE id = ? LIMIT 1",
		encounterID,
	)
	if err != nil {
		return Data{}, err
	}
	encounter := Encounter{}
	for rows.Next() {
		err = rows.Scan(
			&encounter.ID,
			&encounter.StartTime,
			&encounter.EndTime,
			&encounter.Zone,
			&encounter.Damage,
			&encounter.SuccessLevel,
		)
		if err != nil {
			return Data{}, nil
		}
		break
	}
	rows.Close()
	// fetch combatants
	rows, err = database.Query(
		"SELECT encounter_id, name, job, damage, damage_taken, damage_healed, deaths, hits, heals, kills FROM combatant WHERE encounter_id = ?",
		encounterID,
	)
	if err != nil {
		return Data{}, err
	}
	combatants := make([]Combatant, 0)
	for rows.Next() {
		combatant := Combatant{}
		err := rows.Scan(
			&combatant.EncounterID,
			&combatant.Name,
			&combatant.Job,
			&combatant.Damage,
			&combatant.DamageTaken,
			&combatant.DamageHealed,
			&combatant.Deaths,
			&combatant.Hits,
			&combatant.Heals,
			&combatant.Kills,
		)
		if err != nil {
			return Data{}, err
		}
		combatants = append(combatants, combatant)
	}
	rows.Close()
	// return data set
	return Data{
		User:       user,
		Encounter:  encounter,
		Combatants: combatants,
	}, nil
}

// IsActive - Check if data is actively being updated (i.e. active ACT connection)
func (d *Data) IsActive() bool {
	dur := time.Now().Sub(d.LastUpdate)
	return int64(dur/time.Millisecond) < lastUpdateInactiveTime
}
