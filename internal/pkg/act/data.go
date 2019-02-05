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
	"io/ioutil"
	"log"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"../app"
	"../user"

	"github.com/rs/xid"

	_ "github.com/mattn/go-sqlite3" // sqlite driver
)

// lastUpdateInactiveTime - Time in ms between last data updata before data is considered inactive
const lastUpdateInactiveTime = 300000

// pastEncounterFetchLimit - Max number of past encounters to fetch in one request
const PastEncounterFetchLimit = 10

// Data - data about an ACT session
type Data struct {
	Session          Session
	User             user.Data
	Encounter        Encounter
	Combatants       []Combatant
	LogLines         []LogLine
	LastLogLineIndex int
	LastUpdate       time.Time
	NewTickData      bool
	HasValidSession  bool
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
	encounterUIDGenerator := xid.New()
	return Data{
		Session:          session,
		User:             user,
		Encounter:        Encounter{UID: encounterUIDGenerator.String()},
		Combatants:       make([]Combatant, 0),
		LastUpdate:       time.Now(),
		LastLogLineIndex: 0,
		HasValidSession:  false,
	}, nil
}

// UpdateEncounter - Add or update encounter data
func (d *Data) UpdateEncounter(encounter Encounter) {
	d.LastUpdate = time.Now()
	d.NewTickData = true
	// check if encounter update is for current counter
	// update it if so
	if encounter.ActID == d.Encounter.ActID {
		encounter.UID = d.Encounter.UID // copy UID
		d.Encounter = encounter
		// save encounter if it is no longer active
		if !d.Encounter.Active {
			d.UpdateCombatantNames()
			err := d.SaveEncounter()
			if err != nil {
				log.Println("Error while saving encounter", d.Encounter.UID, err)
			}
		}
		return
	}
	// save + clear current encounter if one exists
	if d.Encounter.ActID != 0 {
		d.UpdateCombatantNames()
		err := d.SaveEncounter()
		if err != nil {
			log.Println("Error while saving encounter", d.Encounter.UID, err)
		}
		d.ClearEncounter()
	}
	// create new encounter
	encounterUIDGenerator := xid.New()
	encounter.UID = encounterUIDGenerator.String()
	d.Encounter = encounter
	log.Println("New active encounter. (UID:", d.Encounter.UID, "ActID:", d.Encounter.ActID, "UserID:", d.User.ID, ")")
}

// UpdateCombatant - Add or update combatant data
func (d *Data) UpdateCombatant(combatant Combatant) {
	d.LastUpdate = time.Now()
	d.NewTickData = true
	// ensure there is a current encounter and that data is for it
	if combatant.ActEncounterID == 0 || d.Encounter.ActID == 0 || d.Encounter.UID == "" || combatant.ActEncounterID != d.Encounter.ActID {
		return
	}
	// set encounter UID
	combatant.EncounterUID = d.Encounter.UID
	// look for existing, update if found
	for index, storedCombatant := range d.Combatants {
		if storedCombatant.ID == combatant.ID {
			d.Combatants[index] = combatant
			return
		}
	}
	// add new
	d.Combatants = append(d.Combatants, combatant)
	log.Println("Add combatant", combatant.Name, "(", combatant.ID, ") to encounter", combatant.EncounterUID, "(TotalCombatants:", len(d.Combatants), ")")
}

// UpdateLogLine - Add log line
func (d *Data) UpdateLogLine(logLine LogLine) {
	// update log last update flag
	d.LastUpdate = time.Now()
	// ensure there is a current encounter and that data is for it
	if logLine.ActEncounterID == 0 || d.Encounter.ActID == 0 || d.Encounter.UID == "" || logLine.ActEncounterID != d.Encounter.ActID {
		return
	}
	// set encounter UID
	logLine.EncounterUID = d.Encounter.UID
	// add to log line list
	d.LogLines = append(d.LogLines, logLine)
}

// ClearLogLines - Clear log line buffer
func (d *Data) ClearLogLines() {
	d.LastLogLineIndex = 0
	d.LogLines = make([]LogLine, 0)
}

// getDatabase - get encounter database for given user
func getDatabase(user user.Data) (*sql.DB, error) {
	// open database connection
	database, err := sql.Open("sqlite3", app.DatabasePath)
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
			uid VARCHAR(32),
			act_id INTEGER,
			user_id INTEGER,
			start_time DATETIME,
			end_time DATETIME,
			zone VARCHAR(256),
			damage INTEGER,
			success_level INTEGER,
			CONSTRAINT encounter_uid_unique UNIQUE (uid)
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
			id INTEGER,
			parent_id INTEGER,
			user_id INTEGER,
			encounter_uid VARCHAR(32),
			name VARCHAR(256),
			job VARCHAR(3),
			damage INTEGER,
			damage_taken INTEGER,
			damage_healed INTEGER,
			deaths INTEGER,
			hits INTEGER,
			heals INTEGER,
			kills INTEGER,
			CONSTRAINT encounter_unique UNIQUE (id, user_id, encounter_uid)
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
	if d.Encounter.UID == "" {
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
		REPLACE INTO encounter
		(uid, act_id, user_id, start_time, end_time, zone, damage, success_level) VALUES
		(?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	_, err = stmt.Exec(
		d.Encounter.UID,
		d.Encounter.ActID,
		d.User.ID,
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
			REPLACE INTO combatant
			(id, parent_id, encounter_uid, user_id, name, job, damage, damage_taken, damage_healed, deaths, hits, heals, kills) VALUES
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		if err != nil {
			return err
		}
		_, err = stmt.Exec(
			combatant.ID,
			combatant.ParentID,
			combatant.EncounterUID,
			d.User.ID,
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
	// store log data to binary file
	logBytes := make([]byte, 0)
	for _, logLine := range d.LogLines {
		logBytes = append(logBytes, EncodeLogLineBytes(&logLine)...)
	}
	if len(logBytes) > 0 {
		compressedLogData, err := CompressBytes(logBytes)
		if err != nil {
			return err
		}
		logFilePath := filepath.Join(app.LogPath, d.Encounter.UID+"_LogLines.dat")
		err = ioutil.WriteFile(logFilePath, compressedLogData, 0644)
		if err != nil {
			return err
		}
	}
	return nil
}

// ClearEncounter - delete all data for current encounter from memory
func (d *Data) ClearEncounter() {
	encounterUIDGenerator := xid.New()
	d.Encounter = Encounter{UID: encounterUIDGenerator.String()}
	d.Combatants = make([]Combatant, 0)
	d.ClearLogLines()
}

// GetPreviousEncounter - retrieve previous encounter data from database
func GetPreviousEncounter(user user.Data, encounterUID string) (Data, error) {
	// get database
	database, err := getDatabase(user)
	if err != nil {
		return Data{}, err
	}
	defer database.Close()
	// fetch encounter
	rows, err := database.Query(
		"SELECT uid, act_id, start_time, end_time, zone, damage, success_level FROM encounter WHERE user_id = ? AND uid = ? LIMIT 1",
		user.ID,
		encounterUID,
	)
	if err != nil {
		return Data{}, err
	}
	encounter := Encounter{}
	for rows.Next() {
		err = rows.Scan(
			&encounter.UID,
			&encounter.ActID,
			&encounter.StartTime,
			&encounter.EndTime,
			&encounter.Zone,
			&encounter.Damage,
			&encounter.SuccessLevel,
		)
		if err != nil {
			return Data{}, err
		}
		break
	}
	rows.Close()
	// fetch combatants
	rows, err = database.Query(
		"SELECT id, parent_id, encounter_uid, name, job, damage, damage_taken, damage_healed, deaths, hits, heals, kills FROM combatant WHERE user_id = ? AND encounter_uid = ?",
		user.ID,
		encounterUID,
	)
	if err != nil {
		return Data{}, err
	}
	combatants := make([]Combatant, 0)
	var parentID sql.NullInt64
	for rows.Next() {
		combatant := Combatant{}
		err := rows.Scan(
			&combatant.ID,
			&parentID,
			&combatant.EncounterUID,
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
		if parentID.Valid {
			combatant.ParentID = int32(parentID.Int64)
		}
		if err != nil {
			return Data{}, err
		}
		combatants = append(combatants, combatant)
	}
	rows.Close()
	// fetch log lines file
	logFilePath := filepath.Join(app.LogPath, encounterUID+"_LogLines.dat")
	compressedLogBytes, err := ioutil.ReadFile(logFilePath)
	if err != nil {
		return Data{}, err
	}
	logLines, _, err := DecodeLogLineBytesFile(compressedLogBytes)
	if err != nil {
		return Data{}, err
	}
	// return data set
	d := Data{
		User:       user,
		Encounter:  encounter,
		Combatants: combatants,
		LogLines:   logLines,
	}
	// update combatant names by syncing with log lines
	if d.UpdateCombatantNames() {
		d.SaveEncounter()
	}
	return d, nil
}

// GetPreviousEncounters - retrieve list of previous encounters
func GetPreviousEncounters(user user.Data, offset int) ([]Data, error) {
	// get database
	database, err := getDatabase(user)
	if err != nil {
		return nil, err
	}
	defer database.Close()
	// fetch encounters
	rows, err := database.Query(
		"SELECT uid FROM encounter WHERE DATETIME(start_time) > '01-01-2019 00:00:00' AND DATETIME(end_time) > DATETIME(start_time) AND user_id = ? ORDER BY DATETIME(start_time) DESC LIMIT ? OFFSET ?",
		user.ID,
		PastEncounterFetchLimit,
		offset,
	)
	if err != nil {
		return nil, err
	}
	// fetch encounter uids
	uidList := make([]string, 0)
	for rows.Next() {
		var encounterUID string
		err = rows.Scan(
			&encounterUID,
		)
		uidList = append(uidList, encounterUID)
		if err != nil {
			return nil, err
		}
	}
	rows.Close()
	// get full encounter data with each uid
	encounters := make([]Data, 0)
	for _, encounterUID := range uidList {
		prevEncounter, err := GetPreviousEncounter(user, encounterUID)
		if err != nil {
			return nil, err
		}
		encounters = append(encounters, prevEncounter)
	}
	return encounters, nil
}

// GetPreviousEncounterCount - get total number of previous encounters
func GetPreviousEncounterCount(user user.Data) (int, error) {
	// get database
	database, err := getDatabase(user)
	if err != nil {
		return 0, err
	}
	defer database.Close()
	// fetch encounter counter
	rows, err := database.Query(
		"SELECT COUNT(*) FROM encounter WHERE DATETIME(start_time) > '01-01-2019 00:00:00' AND DATETIME(end_time) > DATETIME(start_time) AND user_id = ?",
		user.ID,
	)
	if err != nil {
		return 0, err
	}
	// retrieve count
	var count int
	for rows.Next() {
		err = rows.Scan(
			&count,
		)
		if err != nil {
			return 0, err
		}
	}
	rows.Close()
	return count, nil
}

// IsActive - Check if data is actively being updated (i.e. active ACT connection)
func (d *Data) IsActive() bool {
	dur := time.Now().Sub(d.LastUpdate)
	return int64(dur/time.Millisecond) < lastUpdateInactiveTime
}

// UpdateCombatantNames - Scan log lines to find correct combatant names
func (d *Data) UpdateCombatantNames() bool {
	hasUpdate := false
	for index, combatant := range d.Combatants {
		if len(combatant.Job) == 0 || strings.Contains(combatant.Name, " (") {
			continue
		}
		for _, logLine := range d.LogLines {
			logSplit := strings.Split(logLine.LogLine[15:], ":")
			if logSplit[0] != "15" {
				continue
			}
			actorId, err := strconv.ParseInt(logSplit[1], 16, 32)
			if err != nil {
				continue
			}
			if int32(actorId) == combatant.ID {
				if combatant.Name != logSplit[2] {
					d.Combatants[index].Name = logSplit[2]
					hasUpdate = true
				}
				break
			}
		}
	}
	// fix pets
	for index, combatant := range d.Combatants {
		if combatant.ParentID != 0 || (combatant.Job != "" && !strings.Contains(combatant.Name, " (")) {
			continue
		}
		nameSplit := strings.Split(combatant.Name, " (")
		if len(nameSplit) < 2 {
			continue
		}
		ownerName := nameSplit[1][:len(nameSplit[1])-1]
		for _, ownerCombatant := range d.Combatants {
			if ownerName == ownerCombatant.Name {
				hasUpdate = true
				d.Combatants[index].ParentID = ownerCombatant.ID
				break
			}
		}
	}
	return hasUpdate
}
