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
	"bufio"
	"compress/gzip"
	"database/sql"
	"fmt"
	"io"
	"log"
	"os"
	"path"
	"path/filepath"
	"time"

	"../app"
	"../user"

	_ "github.com/mattn/go-sqlite3" // sqlite driver
)

// lastUpdateInactiveTime - Time in ms between last data update before data is considered inactive
const lastUpdateInactiveTime = 1800000 // 30 minutes

// logLineRetainCount - Number of log lines to retain in memory before dumping to temp file
const logLineRetainCount = 1000

// PastEncounterFetchLimit - Max number of past encounters to fetch in one request
const PastEncounterFetchLimit = 10

// Data - data about an ACT session
type Data struct {
	Session            Session
	User               user.Data
	EncounterCollector EncounterCollector
	CombatantCollector CombatantCollector
	LogLineBuffer      []LogLine
	LastUpdate         time.Time
	NewTickData        bool
	HasValidSession    bool
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
		Session:            session,
		User:               user,
		EncounterCollector: NewEncounterCollector(&user),
		CombatantCollector: NewCombatantCollector(&user),
		LastUpdate:         time.Now(),
		HasValidSession:    false,
	}, nil
}

// UpdateEncounter - Add or update encounter data
func (d *Data) UpdateEncounter(encounter Encounter) {
	d.LastUpdate = time.Now()
	d.NewTickData = true
	d.EncounterCollector.UpdateEncounter(encounter)
}

// UpdateCombatant - Add or update combatant data
func (d *Data) UpdateCombatant(combatant Combatant) {
	// ensure there is an active encounter
	if !d.EncounterCollector.Encounter.Active {
		return
	}
	d.LastUpdate = time.Now()
	d.NewTickData = true
	// update combatant collector
	d.CombatantCollector.UpdateCombatantTracker(combatant)
}

// GetLogTempPath - Get path to temp log lines file
func (d *Data) GetLogTempPath() string {
	return path.Join(os.TempDir(), fmt.Sprintf("fflp_LogLine_%s.dat", d.EncounterCollector.Encounter.UID))
}

// GetLogPath - Get path to log lines file
func (d *Data) GetLogPath() string {
	tempPath := d.GetLogTempPath()
	if _, err := os.Stat(tempPath); os.IsNotExist(err) {
		return filepath.Join(app.LogPath, d.EncounterCollector.Encounter.UID+"_LogLines.dat")
	}
	return tempPath
}

// UpdateLogLine - Add log line to buffer
func (d *Data) UpdateLogLine(logLine LogLine) {
	// update log last update flag
	d.LastUpdate = time.Now()
	// parse out log line details
	logLineParse, err := ParseLogLine(logLine)
	if err != nil {
		log.Println("Error reading log line,", err)
		return
	}
	// reset encounter
	if d.EncounterCollector.IsNewEncounter(&logLineParse) {
		d.EncounterCollector.Reset()
		d.CombatantCollector.Reset()
	}
	// update encounter collector
	d.EncounterCollector.ReadLogLine(&logLineParse)
	d.CombatantCollector.ReadLogLine(&logLineParse)
	// add log line to buffer if active encounter
	if !d.EncounterCollector.Encounter.Active {
		return
	}
	// set encounter UID
	logLine.EncounterUID = d.EncounterCollector.Encounter.UID
	// add to log line list
	d.LogLineBuffer = append(d.LogLineBuffer, logLine)
}

// ClearLogLines - Clear log lines from current session
func (d *Data) ClearLogLines() {
	d.LogLineBuffer = make([]LogLine, 0)
	os.Remove(d.GetLogTempPath())
}

// DumpLogLineBuffer - Dump log line buffer to temp file
func (d *Data) DumpLogLineBuffer() error {
	logBytes := make([]byte, 0)
	for _, logLine := range d.LogLineBuffer {
		logBytes = append(logBytes, EncodeLogLineBytes(&logLine)...)
	}
	if len(logBytes) > 0 {
		f, err := os.OpenFile(d.GetLogTempPath(), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = f.Write(logBytes)
		if err != nil {
			return err
		}
	}
	// clear buffer
	d.LogLineBuffer = make([]LogLine, 0)
	return nil
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
			act_name VARCHAR(256),
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
	if d.EncounterCollector.Encounter.UID == "" {
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
		d.EncounterCollector.Encounter.UID,
		d.EncounterCollector.Encounter.ActID,
		d.User.ID,
		d.EncounterCollector.Encounter.StartTime,
		d.EncounterCollector.Encounter.EndTime,
		d.EncounterCollector.Encounter.Zone,
		d.EncounterCollector.Encounter.Damage,
		d.EncounterCollector.Encounter.SuccessLevel,
	)
	if err != nil {
		return err
	}
	stmt.Close()
	// insert in to combatant table
	for _, combatant := range d.CombatantCollector.GetCombatants() {
		stmt, err := database.Prepare(`
			REPLACE INTO combatant
			(id, parent_id, encounter_uid, user_id, name, act_name, job, damage, damage_taken, damage_healed, deaths, hits, heals, kills) VALUES
			(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`)
		if err != nil {
			return err
		}
		_, err = stmt.Exec(
			combatant.ID,
			combatant.ParentID,
			d.EncounterCollector.Encounter.UID,
			d.User.ID,
			combatant.Name,
			combatant.ActName,
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
	// dump log lines
	err = d.DumpLogLineBuffer()
	if err != nil {
		return err
	}
	// open temp log file
	tempLogFile, err := os.Open(d.GetLogTempPath())
	if err != nil {
		return err
	}
	defer tempLogFile.Close()
	// open output log file
	logFilePath := filepath.Join(app.LogPath, d.EncounterCollector.Encounter.UID+"_LogLines.dat")
	outLogFile, err := os.OpenFile(logFilePath, os.O_WRONLY|os.O_CREATE, 0664)
	if err != nil {
		return err
	}
	defer outLogFile.Close()
	// create gzip writer
	gzOutLogFile := gzip.NewWriter(outLogFile)
	defer gzOutLogFile.Close()
	gzFw := bufio.NewWriter(gzOutLogFile)
	// itterate log lines and write to output
	var logBuf []byte
	for {
		logBuf = make([]byte, 4096)
		_, err := tempLogFile.Read(logBuf)
		if err != nil {
			if err == io.EOF {
				break
			}
			return err
		}
		_, err = gzFw.Write(logBuf)
		if err != nil {
			return err
		}
	}
	gzFw.Flush()
	return nil
}

// ClearEncounter - delete all data for current encounter from memory
func (d *Data) ClearEncounter() {
	d.ClearLogLines()
	d.EncounterCollector.Reset()
	d.CombatantCollector.Reset()
}

// GetPreviousEncounter - retrieve previous encounter data from database
func GetPreviousEncounter(user user.Data, encounterUID string, fetchLogs bool) (Data, error) {
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
	combatantCollector := NewCombatantCollector(&user)
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
		combatantCollector.UpdateCombatantTracker(combatant)
	}
	rows.Close()
	// build encounter collector
	encounterCollector := NewEncounterCollector(&user)
	encounterCollector.Encounter = encounter
	// return data set
	d := Data{
		User:               user,
		EncounterCollector: encounterCollector,
		CombatantCollector: combatantCollector,
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
		prevEncounter, err := GetPreviousEncounter(user, encounterUID, false)
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
