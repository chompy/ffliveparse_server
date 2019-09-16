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
	"fmt"
	"log"
	"time"

	"../app"
	"../data"
)

// SqliteHandler - handles sqlite storage
type SqliteHandler struct {
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
			CONSTRAINT combatant_unique UNIQUE (user_id, encounter_uid, player_id)
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

// Store - store data objects to sqlite database
func (s *SqliteHandler) Store(objs []interface{}) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	// itterate data to store
	for index := range objs {
		switch objs[index].(type) {
		case *data.Encounter:
			{
				encounter := objs[index].(*data.Encounter)
				log.Printf("[STORAGE][SQLITE] Store encounter '%s.'", encounter.UID)
				stmt, err := s.db.Prepare(`
					REPLACE INTO encounter
					(uid, act_id, compare_hash, user_id, start_time, end_time, zone, damage, success_level) VALUES
					(?, ?, ?, ?, ?, ?, ?, ?, ?)
				`)
				if err != nil {
					return err
				}
				defer stmt.Close()
				_, err = stmt.Exec(
					encounter.UID,
					encounter.ActID,
					encounter.CompareHash,
					encounter.UserID,
					encounter.StartTime,
					encounter.EndTime,
					encounter.Zone,
					encounter.Damage,
					encounter.SuccessLevel,
				)
				if err != nil {
					return err
				}
				break
			}
		case *data.Combatant:
			{
				combatant := objs[index].(*data.Combatant)
				log.Printf("[STORAGE][SQLITE] Store combatant '%d' from encounter '%s.'", combatant.Player.ID, combatant.EncounterUID)
				stmt, err := s.db.Prepare(`
					REPLACE INTO combatant
					(user_id, encounter_uid, player_id, time, job, damage, damage_taken, damage_healed, deaths, hits, heals, kills) VALUES
					(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`)
				if err != nil {
					return err
				}
				defer stmt.Close()
				_, err = stmt.Exec(
					combatant.UserID,
					combatant.EncounterUID,
					combatant.Player.ID,
					combatant.Time,
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
				break
			}
		case *data.Player:
			{
				player := objs[index].(*data.Player)
				log.Printf("[STORAGE][SQLITE] Store player '%d.'", player.ID)
				insStmt, err := s.db.Prepare(`
					INSERT OR IGNORE INTO player
					(id, name, act_name) VALUES
					(?, ?, ?)
				`)
				if err != nil {
					return err
				}
				defer insStmt.Close()
				_, err = insStmt.Exec(
					player.ID,
					player.Name,
					player.ActName,
				)
				if err != nil {
					return err
				}
				if player.World != "" {
					updateStmt, err := s.db.Prepare(`
						UPDATE player SET world_name = ? WHERE id = ?
					`)
					if err != nil {
						return err
					}
					defer updateStmt.Close()
					_, err = updateStmt.Exec(
						player.World,
						player.ID,
					)
					if err != nil {
						return err
					}
				}
				break
			}
		case *data.User:
			{
				user := objs[index].(*data.User)
				log.Printf("[STORAGE][SQLITE] Store user '%d'", user.ID)
				// insert
				if user.ID == 0 {
					stmt, err := s.db.Prepare(`
						INSERT INTO user
						(created, accessed, upload_key, web_key) VALUES
						(?, ?, ?, ?)
					`)
					if err != nil {
						return err
					}
					defer stmt.Close()
					res, err := stmt.Exec(
						user.Created,
						time.Now(),
						user.UploadKey,
						user.WebKey,
					)
					if err != nil {
						return err
					}
					user.ID, err = res.LastInsertId()
					return err
				}
				// update
				stmt, err := s.db.Prepare(`
					UPDATE user SET accessed = ? WHERE id = ?
				`)
				if err != nil {
					return err
				}
				defer stmt.Close()
				_, err = stmt.Exec(
					user.Accessed,
					user.ID,
				)
				if err != nil {
					return err
				}
				break
			}
		}
	}
	return nil
}

// FetchBytes - retrieve data bytes from sqlite (gzip compressed)
func (s *SqliteHandler) FetchBytes(params map[string]interface{}) ([]byte, int, error) {
	// not used
	return nil, 0, nil
}

// appendWhereQueryString - append whery query string
func (s *SqliteHandler) appendWhereQueryString(original string, append string) string {
	if original != "" {
		original += " AND "
	}
	original += append
	return original
}

// Fetch - retrieve data from sqlite
func (s *SqliteHandler) Fetch(params map[string]interface{}) ([]interface{}, int, error) {
	if s.db == nil {
		return nil, 0, fmt.Errorf("database not initialized")
	}
	dType := ParamsGetType(params)
	if dType == "" {
		return nil, 0, nil
	}
	totalCount := 0
	output := make([]interface{}, 0)
	switch dType {
	case StoreTypeEncounter:
		{
			// build 'WHERE' query based on params
			sqlQueryParams := make([]interface{}, 0)
			sqlWhereQueryStr := ""
			for key := range params {
				switch key {
				case "uid":
					{
						val := ParamGetString(params, key)
						if val == "" {
							break
						}
						sqlWhereQueryStr = s.appendWhereQueryString(sqlWhereQueryStr, "uid = ?")
						sqlQueryParams = append(sqlQueryParams, val)
						break
					}
				case "user_id":
					{
						val := ParamGetInt(params, key)
						if val == 0 {
							break
						}
						sqlWhereQueryStr = s.appendWhereQueryString(sqlWhereQueryStr, "encounter.user_id = ?")
						sqlQueryParams = append(sqlQueryParams, val)
						break
					}
				case "start", "start_time", "start_date":
					{
						val := ParamGetTime(params, key)
						if val == nil {
							break
						}
						sqlWhereQueryStr = s.appendWhereQueryString(sqlWhereQueryStr, "DATETIME(start_time) >= ?")
						sqlQueryParams = append(sqlQueryParams, val.UTC())
						break
					}
				case "end", "end_time", "end_date":
					{
						val := ParamGetTime(params, key)
						if val == nil {
							break
						}
						sqlWhereQueryStr = s.appendWhereQueryString(sqlWhereQueryStr, "DATETIME(end_time) <= ?")
						sqlQueryParams = append(sqlQueryParams, val.UTC())
						break
					}
				case "log_clean":
					{
						cleanUpDate := time.Now().Add(time.Duration(-app.EncounterLogDeleteDays*24) * time.Hour)
						sqlWhereQueryStr = s.appendWhereQueryString(sqlWhereQueryStr, "DATETIME(start_time) < ?")
						sqlQueryParams = append(sqlQueryParams, cleanUpDate.UTC())
						break
					}
				}
			}
			if sqlWhereQueryStr != "" {
				sqlWhereQueryStr = "WHERE " + sqlWhereQueryStr
			}
			// build the rest of the query
			sqlQueryStr := `
				SELECT 
				uid, act_id, compare_hash, start_time, end_time, zone, encounter.damage, success_level,
				(SELECT COUNT(*) FROM encounter ` + sqlWhereQueryStr + `)
				FROM 
				encounter
				` + sqlWhereQueryStr + `
				ORDER BY DATETIME(start_time) DESC
				LIMIT ?
				OFFSET ?
			`
			// double up query params for COUNT query
			sqlQueryParams = append(sqlQueryParams, sqlQueryParams...)
			// offset/limit
			sqlQueryParams = append(sqlQueryParams, app.PastEncounterFetchLimit)
			sqlQueryParams = append(sqlQueryParams, ParamGetInt(params, "offset"))
			// fetch results
			rows, err := s.db.Query(
				sqlQueryStr,
				sqlQueryParams...,
			)
			if err != nil {
				log.Println(sqlQueryStr, sqlQueryParams)
				return nil, 0, err
			}
			defer rows.Close()
			// itterate rows, add to output
			for rows.Next() {
				encounter := data.Encounter{}
				var compareHash sql.NullString
				err := rows.Scan(
					&encounter.UID,
					&encounter.ActID,
					&compareHash,
					&encounter.StartTime,
					&encounter.EndTime,
					&encounter.Zone,
					&encounter.Damage,
					&encounter.SuccessLevel,
					&totalCount,
				)
				if err != nil {
					return nil, 0, err
				}
				if compareHash.Valid {
					encounter.CompareHash = compareHash.String
				}
				output = append(output, encounter)
			}
			break
		}
	case StoreTypeCombatant:
		{
			// build 'WHERE' query based on params
			sqlQueryParams := make([]interface{}, 0)
			sqlWhereQueryStr := ""
			for key := range params {
				switch key {
				case "uid", "encounter_uid":
					{
						val := ParamGetString(params, key)
						sqlWhereQueryStr = s.appendWhereQueryString(sqlWhereQueryStr, "combatant.encounter_uid = ?")
						sqlQueryParams = append(sqlQueryParams, val)
						break
					}
				case "user_id":
					{
						val := ParamGetInt(params, key)
						sqlWhereQueryStr = s.appendWhereQueryString(sqlWhereQueryStr, "combatant.user_id = ?")
						sqlQueryParams = append(sqlQueryParams, val)
						break
					}
				}
			}
			if sqlWhereQueryStr != "" {
				sqlWhereQueryStr = "WHERE " + sqlWhereQueryStr
			}
			// build rest of query
			sqlQueryStr := `
				SELECT 
				combatant.encounter_uid, combatant.player_id, combatant.time, combatant.job, combatant.damage, 
				combatant.damage_taken, combatant.damage_healed, combatant.deaths, combatant.hits, combatant.heals,
				combatant.kills, player.name, player.act_name, player.world_name,
				(SELECT COUNT(*) FROM combatant ` + sqlWhereQueryStr + `)
				FROM
				combatant
				INNER JOIN 
				player ON player.id = combatant.player_id
				` + sqlWhereQueryStr + `
				ORDER BY DATETIME(time) ASC
			`
			// double up query params for COUNT query
			sqlQueryParams = append(sqlQueryParams, sqlQueryParams...)
			// fetch results
			rows, err := s.db.Query(
				sqlQueryStr,
				sqlQueryParams...,
			)
			if err != nil {
				log.Println(sqlQueryStr, sqlQueryParams)
				return nil, 0, err
			}
			defer rows.Close()
			// itterate rows, add to output
			var worldName sql.NullString
			var actName sql.NullString
			var combatantTime NullTime
			for rows.Next() {
				player := data.Player{}
				combatant := data.Combatant{}
				err := rows.Scan(
					&combatant.EncounterUID,
					&player.ID,
					&combatantTime,
					&combatant.Job,
					&combatant.Damage,
					&combatant.DamageTaken,
					&combatant.DamageHealed,
					&combatant.Deaths,
					&combatant.Hits,
					&combatant.Heals,
					&combatant.Kills,
					&player.Name,
					&actName,
					&worldName,
					&totalCount,
				)
				if err != nil {
					return nil, 0, err
				}
				if combatantTime.Valid {
					combatant.Time = combatantTime.Time
				}
				if worldName.Valid {
					player.World = worldName.String
				}
				if actName.Valid {
					player.ActName = actName.String
				}
				combatant.Player = player
				output = append(output, combatant)
			}
			break
		}
	case StoreTypeUser:
		{
			// build 'WHERE' query based on params
			sqlQueryParams := make([]interface{}, 0)
			sqlWhereQueryStr := ""
			for key := range params {
				switch key {
				case "id":
					{
						val := ParamGetInt(params, key)
						sqlWhereQueryStr = s.appendWhereQueryString(sqlWhereQueryStr, "id = ?")
						sqlQueryParams = append(sqlQueryParams, val)
						break
					}
				case "web_key":
					{
						val := ParamGetString(params, key)
						sqlWhereQueryStr = s.appendWhereQueryString(sqlWhereQueryStr, "web_key = ?")
						sqlQueryParams = append(sqlQueryParams, val)
						break
					}
				case "upload_key":
					{
						val := ParamGetString(params, key)
						sqlWhereQueryStr = s.appendWhereQueryString(sqlWhereQueryStr, "upload_key = ?")
						sqlQueryParams = append(sqlQueryParams, val)
						break
					}
				}
			}
			if sqlWhereQueryStr != "" {
				sqlWhereQueryStr = "WHERE " + sqlWhereQueryStr
			}
			// build rest of query
			sqlQueryStr := `
				SELECT 
				id, created, accessed, upload_key, web_key,
				(SELECT COUNT(*) FROM combatant ` + sqlWhereQueryStr + `)
				FROM
				user
				` + sqlWhereQueryStr + `
			`
			// double up query params for COUNT query
			sqlQueryParams = append(sqlQueryParams, sqlQueryParams...)
			// fetch results
			rows, err := s.db.Query(
				sqlQueryStr,
				sqlQueryParams...,
			)
			if err != nil {
				return nil, 0, err
			}
			defer rows.Close()
			// itterate rows, add to output
			for rows.Next() {
				user := data.User{}
				err := rows.Scan(
					&user.ID,
					&user.Created,
					&user.Accessed,
					&user.UploadKey,
					&user.WebKey,
					&totalCount,
				)
				if err != nil {
					return nil, 0, err
				}
				output = append(output, user)
			}
			break
		}
	case StoreTypePlayerStat:
		{
			sqlQueryStr := `
				SELECT encounter.uid, encounter.compare_hash, encounter.zone, encounter.start_time, encounter.end_time,
				encounter.user_id, player.id, player.name, player.world_name,
				job, MAX(combatant.damage), combatant.damage_taken, combatant.damage_healed,
				combatant.deaths, combatant.hits, combatant.heals, combatant.kills FROM combatant
				INNER JOIN encounter ON encounter.uid = combatant.encounter_uid
				INNER JOIN player ON player.id = combatant.player_id
				WHERE combatant.hits > 0 AND combatant.time > 0 AND encounter.compare_hash != "" AND encounter.success_level = 1
				GROUP BY encounter.compare_hash, combatant.player_id
				ORDER BY DATETIME(encounter.start_time) DESC
				LIMIT 3000
			`
			// fetch results
			rows, err := s.db.Query(
				sqlQueryStr,
			)
			if err != nil {
				return nil, 0, err
			}
			defer rows.Close()
			// itterate rows, add to output
			for rows.Next() {
				combatant := data.Combatant{
					Player: data.Player{},
				}
				encounter := data.Encounter{}
				var worldName sql.NullString
				userID := int64(0)
				err := rows.Scan(
					&encounter.UID,
					&encounter.CompareHash,
					&encounter.Zone,
					&encounter.StartTime,
					&encounter.EndTime,
					&userID,
					&combatant.Player.ID,
					&combatant.Player.Name,
					&worldName,
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
					return nil, 0, err
				}
				if worldName.Valid {
					combatant.Player.World = worldName.String
				}
				combatant.EncounterUID = encounter.UID
				encounterTime := encounter.EndTime.Sub(encounter.StartTime)
				webIDStr, _ := data.GetWebIDStringFromID(userID)
				playerStat := data.PlayerStat{
					Combatant: combatant,
					Encounter: encounter,
					DPS:       float64(combatant.Damage) / float64(encounterTime.Seconds()),
					HPS:       float64(combatant.DamageHealed) / float64(encounterTime.Seconds()),
					URL:       "/" + webIDStr + "/" + encounter.UID,
				}
				output = append(output, playerStat)
			}
			break
		}
	}
	return output, totalCount, nil
}

// Remove - remove objects from database
func (s *SqliteHandler) Remove(params map[string]interface{}) (int, error) {
	return 0, nil
}

// CleanUp - perform clean up operations
func (s *SqliteHandler) CleanUp() error {
	startTime := time.Now()
	count := int64(0)
	log.Println("[STORAGE][SQLITE] Begin database clean up.")
	// delete encounters older then EncounterDeleteDays days
	cleanUpDate := time.Now().Add(time.Duration(-app.EncounterDeleteDays*24) * time.Hour)
	res, err := s.db.Exec(
		"DELETE FROM encounter WHERE DATETIME(start_time) < ?",
		cleanUpDate,
	)
	if err != nil {
		return err
	}
	rowCount, _ := res.RowsAffected()
	count += rowCount
	// delete all combatants that don't have an encounter
	res, err = s.db.Exec(
		"DELETE FROM combatant WHERE (SELECT COUNT(*) FROM encounter WHERE uid = combatant.encounter_uid) = 0",
	)
	rowCount, _ = res.RowsAffected()
	count += rowCount
	// TODO - delete users that never uploaded
	log.Println("[STORAGE][SQLITE] Database clean up complete. (", count, "records removed. ) (", time.Now().Sub(startTime), ")")
	return err
}
