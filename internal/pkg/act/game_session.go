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
	"crypto/md5"
	"fmt"
	"io"
	"sort"
	"strconv"
	"time"

	"../app"
	"../data"
	"../storage"

	_ "github.com/mattn/go-sqlite3" // sqlite driver
)

// logLineRetainCount - Number of log lines to retain in memory before dumping to file
const logLineRetainCount = 1000

// GameSession - data about an ACT session
type GameSession struct {
	Buffer              data.Buffer
	Session             data.Session
	User                data.User
	EncounterCollector  EncounterCollector
	CombatantCollector  CombatantCollector
	LastUpdate          time.Time
	NewTickData         bool
	HasValidSession     bool
	LogLineCounter      int
	Storage             *storage.Manager
	lastCombatantBuffer time.Time
}

// NewGameSession - create new ACT session data
func NewGameSession(session data.Session, user data.User, storage *storage.Manager) (GameSession, error) {
	return GameSession{
		Buffer:              data.NewBuffer(&user),
		Session:             session,
		User:                user,
		EncounterCollector:  NewEncounterCollector(&user),
		CombatantCollector:  NewCombatantCollector(&user),
		LastUpdate:          time.Now(),
		HasValidSession:     false,
		LogLineCounter:      0,
		Storage:             storage,
		lastCombatantBuffer: time.Now(),
	}, nil
}

// UpdateEncounter - Add or update encounter data
func (s *GameSession) UpdateEncounter(encounter data.Encounter) {
	if time.Now().Sub(encounter.StartTime) > time.Hour {
		return
	}
	s.LastUpdate = time.Now()
	s.NewTickData = true
	s.EncounterCollector.Update(encounter)
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
	s.CombatantCollector.Update(combatant)
}

// UpdateLogLine - Add log line to buffer
func (s *GameSession) UpdateLogLine(logLine data.LogLine) error {
	if time.Now().Sub(logLine.Time) > time.Hour {
		return nil
	}
	// update log last update flag
	s.LastUpdate = time.Now()
	// parse out log line details
	logLineParse, err := ParseLogLine(logLine)
	if err != nil {
		return err
	}
	// if empty log line then no need to proceed
	if logLineParse.Raw == "" {
		return nil
	}
	// set encounter UID
	logLine.EncounterUID = s.EncounterCollector.Encounter.UID
	// reset encounter
	if s.EncounterCollector.IsNewEncounter(&logLineParse) {
		s.EncounterCollector.Reset()
		s.CombatantCollector.Reset()
		s.Buffer.Reset()
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
		return nil
	}
	// add to buffer
	s.Buffer.Add(&logLine)
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
	combatants := s.CombatantCollector.GetLatestSnapshots()
	sort.Slice(combatants, func(i, j int) bool {
		return combatants[i].Player.ID < combatants[j].Player.ID
	})
	// build encounter compare hash
	// this is used to determine if two different user's encounters
	// are actually the same encounter
	h := md5.New()
	io.WriteString(h, s.EncounterCollector.Encounter.StartTime.UTC().String())
	for _, combatant := range combatants {
		io.WriteString(h, strconv.Itoa(int(combatant.Player.ID)))
	}
	s.EncounterCollector.Encounter.CompareHash = fmt.Sprintf("%x", h.Sum(nil))
	// save encounter to database
	s.EncounterCollector.Encounter.UserID = s.User.ID
	dbStore := make([]interface{}, 1)
	dbStore[0] = &s.EncounterCollector.Encounter
	for index := range combatants {
		dbStore = append(dbStore, &combatants[index])
	}
	err := s.Storage.DB.Store(dbStore)
	if err != nil {
		return err
	}
	// dump buffer
	_, err = s.Buffer.Dump()
	if err != nil {
		return err
	}
	// read buffer
	bufFile, err := s.Buffer.GetReadFile()
	if err != nil {
		return err
	}
	defer bufFile.Close()
	defer s.Buffer.Reset()
	// save encounter to file
	err = s.Storage.File.OpenWrite(s.EncounterCollector.Encounter.UID)
	if err != nil {
		return err
	}
	defer s.Storage.File.Close()
	// - save encounter
	s.Storage.File.Write(&s.EncounterCollector.Encounter)
	// - save combatant snapshots
	for _, snapshots := range s.CombatantCollector.GetSnapshots() {
		for _, combatant := range snapshots {
			combatant.EncounterUID = s.EncounterCollector.Encounter.UID
			combatant.UserID = s.User.ID
			err = s.Storage.File.Write(&combatant)
			if err != nil {
				return err
			}
		}
	}
	// - save buffer (log lines)
	err = s.Storage.File.Write(bufFile)
	if err != nil {
		return err
	}
	return nil
}

// ClearEncounter - delete all data for current encounter from memory
func (s *GameSession) ClearEncounter() {
	s.Buffer.Reset()
	s.EncounterCollector.Reset()
	s.CombatantCollector.Reset()
}

// getEncounterCombatants - fetch all combatants in an encounter
func getEncounterCombatants(sm *storage.Manager, user data.User, encounterUID string) (CombatantCollector, error) {
	combatants, _, err := sm.DB.Fetch(map[string]interface{}{
		"type":          storage.StoreTypeCombatant,
		"user_id":       int(user.ID),
		"encounter_uid": encounterUID,
	})
	if err != nil {
		return CombatantCollector{}, err
	}
	combatantCollector := NewCombatantCollector(&user)
	for _, combatant := range combatants {
		combatantCollector.Update(combatant.(data.Combatant))
	}
	for index := range combatantCollector.CombatantTrackers {
		combatantCollector.CombatantTrackers[index].Offset = data.Combatant{}
	}
	return combatantCollector, nil
}

// GetPreviousEncounter - retrieve previous encounter data from database
func GetPreviousEncounter(sm *storage.Manager, user data.User, encounterUID string) (GameSession, error) {
	// fetch encounter
	encounters, count, err := sm.DB.Fetch(map[string]interface{}{
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
		Storage:            sm,
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
	encounters, count, err := sm.DB.Fetch(map[string]interface{}{
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
			Storage:            sm,
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
