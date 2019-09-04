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

package storage

import (
	"database/sql"

	"../act"
)

// SqliteHandler - handles sqlite storage
type SqliteHandler struct {
	BaseHandler
	path string
	db   *sql.DB
}

// NewSqliteHandler - create new sqlite handler
func NewSqliteHandler(path string) (SqliteHandler, error) {
	return SqliteHandler{
		db:   nil,
		path: path,
	}, nil
}

// Init - init sqlite handler
func (s *SqliteHandler) Init() error {
	var err error
	s.db, err = sql.Open("sqlite3", s.path+"?_journal=WAL")
	if err != nil {
		return err
	}
	err = s.createEncounterTable()
	if err != nil {
		return err
	}
	err = s.createCombatantTable()
	if err != nil {
		return err
	}
	err = s.createPlayerTable()
	if err != nil {
		return err
	}
	err = s.createUserTable()
	return err
}

// createEncounterTable - create encounter table
func (s *SqliteHandler) createEncounterTable() error {
	stmt, err := s.db.Prepare(`
		CREATE TABLE IF NOT EXISTS encounter
		(
			uid VARCHAR(32),
			act_id INTEGER,
			compare_hash VARCHAR(32),
			user_id INTEGER,
			start_time DATETIME,
			end_time DATETIME,
			zone VARCHAR(256),
			damage INTEGER,
			success_level INTEGER,
			has_logs BOOL,
			CONSTRAINT encounter_uid_unique UNIQUE (uid)
		)
	`)
	if err != nil {
		return err
	}
	_, err = stmt.Exec()
	return err
}

// createPlayerTable - create player table
func (s *SqliteHandler) createPlayerTable() error {
	stmt, err := s.db.Prepare(`
		CREATE TABLE IF NOT EXISTS player
		(
			id INTEGER,
			name VARCHAR(256),
			act_name VARCHAR(256),
			world_name VARCHAR(256),
			CONSTRAINT player_id UNIQUE (id),
			CONSTRAINT player_unique UNIQUE (id, name)
		)
	`)
	if err != nil {
		return err
	}
	_, err = stmt.Exec()
	return err
}

// createCombatantTable - create combatant table
func (s *SqliteHandler) createCombatantTable() error {
	stmt, err := s.db.Prepare(`
		CREATE TABLE IF NOT EXISTS combatant
		(
			user_id INTEGER,
			encounter_uid VARCHAR(32),
			player_id INTEGER,
			time DATETIME,
			job VARCHAR(3),
			damage INTEGER,
			damage_taken INTEGER,
			damage_healed INTEGER,
			deaths INTEGER,
			hits INTEGER,
			heals INTEGER,
			kills INTEGER,
			CONSTRAINT combatant_unique UNIQUE (user_id, encounter_uid, player_id, time)
		)
	`)
	if err != nil {
		return err
	}
	_, err = stmt.Exec()
	return err
}

// createUserTable - create user table
func (s *SqliteHandler) createUserTable() error {
	stmt, err := s.db.Prepare(`
		CREATE TABLE IF NOT EXISTS user
		(
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			created DATETIME DEFAULT CURRENT_TIMESTAMP,
			accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
			upload_key VARCHAR(32),
			web_key VARCHAR(32),
			CONSTRAINT user_upload_key_unique UNIQUE (upload_key)
			CONSTRAINT user_web_key_unique UNIQUE (web_key)
		)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	_, err = stmt.Exec()
	return err
}

// Store - store data to sqlite database
func (s *SqliteHandler) Store(data []interface{}) error {
	// itterate data to store
	for index := range data {
		switch data[index].(type) {
		case *act.Encounter:
			{
				break
			}
		case *act.LogLine:
			{
				break
			}
		}
	}
	return nil
}
