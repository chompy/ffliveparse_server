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
	"crypto/md5"
	"fmt"
	"io"
	"log"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"time"

	"github.com/olebedev/emitter"

	"../app"
	"../user"

	_ "github.com/mattn/go-sqlite3" // sqlite driver
)

// logLineRetainCount - Number of log lines to retain in memory before dumping to temp file
const logLineRetainCount = 1000

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
	HasLogs            bool
	LogLineCounter     int
	events             *emitter.Emitter
}

// NewData - create new ACT session data
func NewData(session Session, user user.Data, events *emitter.Emitter) (Data, error) {
	return Data{
		Session:            session,
		User:               user,
		EncounterCollector: NewEncounterCollector(&user),
		CombatantCollector: NewCombatantCollector(&user),
		LastUpdate:         time.Now(),
		HasValidSession:    false,
		LogLineCounter:     0,
		events:             events,
	}, nil
}

// UpdateEncounter - Add or update encounter data
func (d *Data) UpdateEncounter(encounter Encounter) {
	if time.Now().Sub(encounter.StartTime) > time.Hour {
		return
	}
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

// getPermanentLogPath - Get path to permanent log file from uid
func getPermanentLogPath(uid string) string {
	return filepath.Join(app.LogPath, uid+"_LogLines.dat")
}

// GetLogPath - Get path to log lines file
func (d *Data) GetLogPath() string {
	tempPath := d.GetLogTempPath()
	if _, err := os.Stat(tempPath); os.IsNotExist(err) {
		return getPermanentLogPath(d.EncounterCollector.Encounter.UID)
	}
	return tempPath
}

// UpdateLogLine - Add log line to buffer
func (d *Data) UpdateLogLine(logLine LogLine) {
	if time.Now().Sub(logLine.Time) > time.Hour {
		return
	}
	d.LogLineCounter++
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
	wasActiveEncounter := d.EncounterCollector.Encounter.Active
	d.EncounterCollector.ReadLogLine(&logLineParse)
	d.CombatantCollector.ReadLogLine(&logLineParse)
	// add log line to buffer if active encounter
	if !d.EncounterCollector.Encounter.Active {
		if wasActiveEncounter {
			d.NewTickData = true
		}
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

// SaveEncounter - save all data related to current encounter
func (d *Data) SaveEncounter() error {
	// no encounter
	if d.EncounterCollector.Encounter.UID == "" {
		return nil
	}
	// ensure encounter meets min encounter length
	duration := d.EncounterCollector.Encounter.EndTime.Sub(d.EncounterCollector.Encounter.StartTime)
	if duration < app.MinEncounterSaveLength*time.Millisecond || duration > app.MaxEncounterSaveLength*time.Millisecond {
		return nil
	}
	// get sorted combatants
	combatants := d.CombatantCollector.GetCombatants()
	sort.Slice(combatants, func(i, j int) bool {
		return combatants[i][0].Player.ID < combatants[j][0].Player.ID
	})
	// build encounter compare hash
	// this is used to determine if two different user's encounters
	// are actually the same encounter
	h := md5.New()
	io.WriteString(h, d.EncounterCollector.Encounter.StartTime.UTC().String())
	for _, combatant := range combatants {
		io.WriteString(h, strconv.Itoa(int(combatant[0].Player.ID)))
	}
	d.EncounterCollector.Encounter.CompareHash = fmt.Sprintf("%x", h.Sum(nil))
	// insert in to encounter table
	finE := make(chan bool)
	d.events.Emit(
		"database:save",
		finE,
		&d.EncounterCollector.Encounter,
		int(d.User.ID),
	)
	<-finE
	// insert in to combatant+player tables
	for _, combatantSnapshots := range combatants {
		// insert combatant
		for _, combatant := range combatantSnapshots {
			combatant.EncounterUID = d.EncounterCollector.Encounter.UID
			finC := make(chan bool)
			d.events.Emit(
				"database:save",
				finC,
				&combatant,
				int(d.User.ID),
			)
			<-finC
		}
		// insert player
		finP := make(chan bool)
		d.events.Emit(
			"database:save",
			finP,
			&combatantSnapshots[0].Player,
		)
		<-finP
	}
	// dump log lines
	err := d.DumpLogLineBuffer()
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

// getEncounterCombatants - fetch all combatants in an encounter
func getEncounterCombatants(events *emitter.Emitter, user user.Data, encounterUID string) (CombatantCollector, error) {
	combatants := make([]Combatant, 0)
	fin := make(chan bool)
	events.Emit(
		"database:find",
		fin,
		&combatants,
		int(user.ID),
		encounterUID,
	)
	<-fin
	combatantCollector := NewCombatantCollector(&user)
	for _, combatant := range combatants {
		combatantCollector.UpdateCombatantTracker(combatant)
	}
	for index := range combatantCollector.CombatantTrackers {
		combatantCollector.CombatantTrackers[index].Offset = Combatant{}
	}
	return combatantCollector, nil
}

// GetPreviousEncounter - retrieve previous encounter data from database
func GetPreviousEncounter(events *emitter.Emitter, user user.Data, encounterUID string) (Data, error) {
	// fetch encounter
	encounter := Encounter{}
	fin := make(chan bool)
	events.Emit(
		"database:fetch",
		fin,
		&encounter,
		int(user.ID),
		encounterUID,
	)
	<-fin
	// fetch combatants
	combatantCollector, err := getEncounterCombatants(
		events,
		user,
		encounterUID,
	)
	if err != nil {
		return Data{}, err
	}
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
func GetPreviousEncounters(
	events *emitter.Emitter,
	user user.Data,
	offset int,
	query string,
	start *time.Time,
	end *time.Time,
	totalCount *int,
) ([]Data, error) {

	encounters := make([]Encounter, 0)
	fin := make(chan bool)
	events.Emit(
		"database:find",
		fin,
		&encounters,
		int(user.ID),
		offset,
		query,
		start,
		end,
		totalCount,
	)
	<-fin
	dataRes := make([]Data, 0)
	for _, encounter := range encounters {
		// build collectors
		encounterCollector := NewEncounterCollector(&user)
		encounterCollector.Encounter = encounter
		// build data object
		data := Data{
			User:               user,
			EncounterCollector: encounterCollector,
			CombatantCollector: CombatantCollector{},
			HasLogs:            encounter.HasLogs,
		}
		dataRes = append(dataRes, data)
	}
	return dataRes, nil
}

// IsActive - Check if data is actively being updated (i.e. active ACT connection)
func (d *Data) IsActive() bool {
	dur := time.Now().Sub(d.LastUpdate)
	return dur < time.Duration(app.LastUpdateInactiveTime*time.Millisecond)
}

// CleanUpEncounters - delete log files for old encounters
func CleanUpEncounters(events *emitter.Emitter) {
	for range time.Tick(app.EncounterCleanUpRate * time.Millisecond) {
		log.Println("[CLEAN] Begin log clean up.")
		// fetch encounters
		encounterUIDs := make([]string, 0)
		fin := make(chan bool)
		events.Emit(
			"database:find_encounter_log_clean",
			fin,
			&encounterUIDs,
		)
		<-fin
		// itterate uids and clean up log entries
		cleanUpCount := 0
		for _, uid := range encounterUIDs {
			// flag removal of log
			finC := make(chan bool)
			events.Emit(
				"database:flag_encounter_log_clean",
				finC,
				uid,
			)
			<-finC
			// check if log exists
			logPath := getPermanentLogPath(uid)
			if _, err := os.Stat(logPath); os.IsNotExist(err) {
				// update database if log file is missing
				log.Println("[CLEAN] Delete log for", uid, "(log flag missing from database)")
				continue
			}
			// delete log file
			err := os.Remove(logPath)
			if err != nil {
				log.Println("[CLEAN] Error", uid, err.Error())
				continue
			}
			log.Println("[CLEAN] Delete log for", uid)
			cleanUpCount++
		}
		// delete encounters
		encountersDeleted := int64(0)
		fin2 := make(chan bool)
		events.Emit(
			"database:encounter_clean",
			fin2,
			&encountersDeleted,
		)
		<-fin2
		log.Println("[CLEAN] Completed. Removed", cleanUpCount, "log(s) and", encountersDeleted, "encounters(s).")
	}
}

// GetTotalEncounterCount - get total number of encounters
func GetTotalEncounterCount(events *emitter.Emitter) int {
	res := int(0)
	fin := make(chan bool)
	events.Emit(
		"database:total_count",
		fin,
		&res,
		"encounter",
	)
	<-fin
	return res
}

// GetTotalCombatantCount - get total number of combatants
func GetTotalCombatantCount(events *emitter.Emitter) int {
	res := int(0)
	fin := make(chan bool)
	events.Emit(
		"database:total_count",
		fin,
		&res,
		"combatant",
	)
	<-fin
	return res
}

// GetTotalPlayerCount - get total number of players
func GetTotalPlayerCount(events *emitter.Emitter) int {
	res := int(0)
	fin := make(chan bool)
	events.Emit(
		"database:total_count",
		fin,
		&res,
		"player",
	)
	<-fin
	return res
}

// GetTotalUserCount - get total number of users
func GetTotalUserCount(events *emitter.Emitter) int {
	res := int(0)
	fin := make(chan bool)
	events.Emit(
		"database:total_count",
		fin,
		&res,
		"user",
	)
	<-fin
	return res
}
