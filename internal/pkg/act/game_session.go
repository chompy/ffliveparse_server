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

	"../app"
	"../data"
	"../storage"

	_ "github.com/mattn/go-sqlite3" // sqlite driver
)

// logLineRetainCount - Number of log lines to retain in memory before dumping to temp file
const logLineRetainCount = 1000

// GameSession - data about an ACT session
type GameSession struct {
	Session            data.Session
	User               data.User
	EncounterCollector EncounterCollector
	CombatantCollector CombatantCollector
	LogLineBuffer      []data.LogLine
	LastUpdate         time.Time
	NewTickData        bool
	HasValidSession    bool
	HasLogs            bool
	LogLineCounter     int
	storage            *storage.Manager
}

// NewGameSession - create new ACT session data
func NewGameSession(session data.Session, user data.User, storage *storage.Manager) (GameSession, error) {
	return GameSession{
		Session:            session,
		User:               user,
		EncounterCollector: NewEncounterCollector(&user),
		CombatantCollector: NewCombatantCollector(&user),
		LastUpdate:         time.Now(),
		HasValidSession:    false,
		LogLineCounter:     0,
		storage:            storage,
	}, nil
}

// UpdateEncounter - Add or update encounter data
func (s *GameSession) UpdateEncounter(encounter data.Encounter) {
	if time.Now().Sub(encounter.StartTime) > time.Hour {
		return
	}
	s.LastUpdate = time.Now()
	s.NewTickData = true
	s.EncounterCollector.UpdateEncounter(encounter)
}

// UpdateCombatant - Add or update combatant data
func (s *GameSession) UpdateCombatant(combatant data.Combatant) {
	// ensure there is an active encounter
	if !s.EncounterCollector.Encounter.Active {
		return
	}
	s.LastUpdate = time.Now()
	s.NewTickData = true
	// update combatant collector
	s.CombatantCollector.UpdateCombatantTracker(combatant)
}

// GetLogTempPath - Get path to temp log lines file
func (s *GameSession) GetLogTempPath() string {
	return path.Join(os.TempDir(), fmt.Sprintf("fflp_LogLine_%s.dat", s.EncounterCollector.Encounter.UID))
}

// getPermanentLogPath - Get path to permanent log file from uid
func getPermanentLogPath(uid string) string {
	return filepath.Join(app.LogPath, uid+"_LogLines.dat")
}

// GetLogPath - Get path to log lines file
func (s *GameSession) GetLogPath() string {
	tempPath := s.GetLogTempPath()
	if _, err := os.Stat(tempPath); os.IsNotExist(err) {
		return getPermanentLogPath(s.EncounterCollector.Encounter.UID)
	}
	return tempPath
}

// UpdateLogLine - Add log line to buffer
func (s *GameSession) UpdateLogLine(logLine data.LogLine) {
	if time.Now().Sub(logLine.Time) > time.Hour {
		return
	}
	s.LogLineCounter++
	// update log last update flag
	s.LastUpdate = time.Now()
	// parse out log line details
	logLineParse, err := ParseLogLine(logLine)
	if err != nil {
		log.Println("Error reading log line,", err)
		return
	}
	// reset encounter
	if s.EncounterCollector.IsNewEncounter(&logLineParse) {
		s.EncounterCollector.Reset()
		s.CombatantCollector.Reset()
	}
	// update encounter collector
	wasActiveEncounter := s.EncounterCollector.Encounter.Active
	s.EncounterCollector.ReadLogLine(&logLineParse)
	s.CombatantCollector.ReadLogLine(&logLineParse)
	// add log line to buffer if active encounter
	if !s.EncounterCollector.Encounter.Active {
		if wasActiveEncounter {
			s.NewTickData = true
		}
		return
	}
	// set encounter UID
	logLine.EncounterUID = s.EncounterCollector.Encounter.UID
	// add to log line list
	s.LogLineBuffer = append(s.LogLineBuffer, logLine)
}

// ClearLogLines - Clear log lines from current session
func (s *GameSession) ClearLogLines() {
	s.LogLineBuffer = make([]data.LogLine, 0)
	os.Remove(s.GetLogTempPath())
}

// DumpLogLineBuffer - Dump log line buffer to temp file
func (s *GameSession) DumpLogLineBuffer() error {
	logBytes := make([]byte, 0)
	for _, logLine := range s.LogLineBuffer {
		logBytes = append(logBytes, logLine.ToBytes()...)
	}
	if len(logBytes) > 0 {
		f, err := os.OpenFile(s.GetLogTempPath(), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
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
	s.LogLineBuffer = make([]data.LogLine, 0)
	return nil
}

// SaveEncounter - save all data related to current encounter
func (s *GameSession) SaveEncounter() error {
	// no encounter
	if s.EncounterCollector.Encounter.UID == "" {
		return nil
	}
	// ensure encounter meets min encounter length
	duration := s.EncounterCollector.Encounter.EndTime.Sub(s.EncounterCollector.Encounter.StartTime)
	if duration < app.MinEncounterSaveLength*time.Millisecond || duration > app.MaxEncounterSaveLength*time.Millisecond {
		return nil
	}
	// get sorted combatants
	combatants := s.CombatantCollector.GetCombatants()
	sort.Slice(combatants, func(i, j int) bool {
		return combatants[i][0].Player.ID < combatants[j][0].Player.ID
	})
	// build encounter compare hash
	// this is used to determine if two different user's encounters
	// are actually the same encounter
	h := md5.New()
	io.WriteString(h, s.EncounterCollector.Encounter.StartTime.UTC().String())
	for _, combatant := range combatants {
		io.WriteString(h, strconv.Itoa(int(combatant[0].Player.ID)))
	}
	s.EncounterCollector.Encounter.CompareHash = fmt.Sprintf("%x", h.Sum(nil))
	// insert in to encounter table
	s.EncounterCollector.Encounter.UserID = s.User.ID
	store := make([]interface{}, 1)
	store[0] = &s.EncounterCollector.Encounter
	s.storage.Store(store)
	// insert in to combatant+player tables
	for _, combatantSnapshots := range combatants {
		// insert combatant
		for _, combatant := range combatantSnapshots {
			combatant.EncounterUID = s.EncounterCollector.Encounter.UID
			combatant.UserID = s.User.ID
			store[0] = &combatant
			s.storage.Store(store)
		}
		// insert player
		store[0] = &combatantSnapshots[0].Player
		s.storage.Store(store)
	}
	// dump log lines
	err := s.DumpLogLineBuffer()
	if err != nil {
		return err
	}
	// open temp log file
	tempLogFile, err := os.Open(s.GetLogTempPath())
	if err != nil {
		return err
	}
	defer tempLogFile.Close()
	// open output log file
	logFilePath := filepath.Join(app.LogPath, s.EncounterCollector.Encounter.UID+"_LogLines.dat")
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
func (s *GameSession) ClearEncounter() {
	s.ClearLogLines()
	s.EncounterCollector.Reset()
	s.CombatantCollector.Reset()
}

// getEncounterCombatants - fetch all combatants in an encounter
func getEncounterCombatants(sm *storage.Manager, user data.User, encounterUID string) (CombatantCollector, error) {
	combatants, _, err := sm.Fetch(map[string]interface{}{
		"type":          storage.StoreTypeCombatant,
		"user_id":       int(user.ID),
		"encounter_uid": encounterUID,
	})
	if err != nil {
		return CombatantCollector{}, err
	}
	combatantCollector := NewCombatantCollector(&user)
	for _, combatant := range combatants {
		combatantCollector.UpdateCombatantTracker(combatant.(data.Combatant))
	}
	for index := range combatantCollector.CombatantTrackers {
		combatantCollector.CombatantTrackers[index].Offset = data.Combatant{}
	}
	return combatantCollector, nil
}

// GetPreviousEncounter - retrieve previous encounter data from database
func GetPreviousEncounter(sm *storage.Manager, user data.User, encounterUID string) (GameSession, error) {
	// fetch encounter
	encounters, count, err := sm.Fetch(map[string]interface{}{
		"type":    storage.StoreTypeEncounter,
		"user_id": int(user.ID),
		"uid":     encounterUID,
	})
	if err != nil {
		return GameSession{}, err
	}
	if count == 0 {
		return GameSession{}, fmt.Errorf("no previous encounter found with user id '%d' and encounter uid '%s'", user.ID, encounterUID)
	}
	// fetch combatants
	combatantCollector, err := getEncounterCombatants(
		sm,
		user,
		encounterUID,
	)
	if err != nil {
		return GameSession{}, err
	}
	// build encounter collector
	encounterCollector := NewEncounterCollector(&user)
	encounterCollector.Encounter = encounters[0].(data.Encounter)
	// return data set
	s := GameSession{
		User:               user,
		EncounterCollector: encounterCollector,
		CombatantCollector: combatantCollector,
	}
	return s, nil
}

// GetPreviousEncounters - retrieve list of previous encounters
func GetPreviousEncounters(
	sm *storage.Manager,
	user data.User,
	offset int,
	query string,
	start *time.Time,
	end *time.Time,
	totalCount *int,
) ([]GameSession, error) {

	encounters, count, err := sm.Fetch(map[string]interface{}{
		"type":    storage.StoreTypeEncounter,
		"user_id": int(user.ID),
		"query":   query,
		"start":   start,
		"end":     end,
		"offset":  offset,
	})
	*totalCount = count
	sessionRes := make([]GameSession, 0)
	if err != nil {
		return sessionRes, err
	}
	for _, encounter := range encounters {
		// build collectors
		encounterCollector := NewEncounterCollector(&user)
		encounterCollector.Encounter = encounter.(data.Encounter)
		// build data object
		sess := GameSession{
			User:               user,
			EncounterCollector: encounterCollector,
			CombatantCollector: CombatantCollector{},
			HasLogs:            encounter.(data.Encounter).HasLogs,
		}
		sessionRes = append(sessionRes, sess)
	}
	return sessionRes, nil
}

// IsActive - Check if data is actively being updated (i.e. active ACT connection)
func (s *GameSession) IsActive() bool {
	dur := time.Now().Sub(s.LastUpdate)
	return dur < time.Duration(app.LastUpdateInactiveTime*time.Millisecond)
}
