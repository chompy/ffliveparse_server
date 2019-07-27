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

package database

import (
	"database/sql"
	"time"

	"../act"
	"../app"
)

// CreateEncounterTable - create encounter database table
func CreateEncounterTable(db *sql.DB) error {
	stmt, err := db.Prepare(`
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

// SaveEncounter - save encounter to database
func SaveEncounter(userID int, encounter *act.Encounter, db *sql.DB) error {
	stmt, err := db.Prepare(`
		REPLACE INTO encounter
		(uid, act_id, compare_hash, user_id, start_time, end_time, zone, damage, success_level, has_logs) VALUES
		(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	_, err = stmt.Exec(
		encounter.UID,
		encounter.ActID,
		encounter.CompareHash,
		userID,
		encounter.StartTime,
		encounter.EndTime,
		encounter.Zone,
		encounter.Damage,
		encounter.SuccessLevel,
		true,
	)
	return err
}

// FetchEncounter - fetch encounter of given UID
func FetchEncounter(userID int, encounterUID string, db *sql.DB, encounter *act.Encounter) error {
	// fetch encounter
	rows, err := db.Query(
		"SELECT uid, act_id, compare_hash, start_time, end_time, zone, damage, success_level FROM encounter WHERE user_id = ? AND uid = ? LIMIT 1",
		userID,
		encounterUID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		err = rows.Scan(
			&encounter.UID,
			&encounter.ActID,
			&encounter.CompareHash,
			&encounter.StartTime,
			&encounter.EndTime,
			&encounter.Zone,
			&encounter.Damage,
			&encounter.SuccessLevel,
		)
		if err != nil {
			return err
		}
		break
	}
	return nil
}

// FindEncounters - find encounters with given parameters
func FindEncounters(userID int, offset int, query string, start *time.Time, end *time.Time, db *sql.DB, encounters *[]act.Encounter) error {
	// build query
	params := make([]interface{}, 1)
	params[0] = userID
	dbQueryStr := "SELECT DISTINCT(uid), act_id, compare_hash, start_time, end_time, zone, encounter.damage, success_level, has_logs"
	dbQueryStr += " FROM encounter INNER JOIN combatant ON combatant.encounter_uid = encounter.uid"
	dbQueryStr += " INNER JOIN player ON player.id = combatant.player_id"
	dbQueryStr += " WHERE DATETIME(end_time) > DATETIME(start_time)"
	dbQueryStr += " AND encounter.user_id = ?"
	// search string
	if query != "" {
		dbQueryStr += " AND (zone LIKE ? OR player.name LIKE ?)"
		params = append(params, "%"+query+"%", "%"+query+"%")
	}
	// start date
	if start != nil {
		dbQueryStr += " AND DATETIME(start_time) >= ?"
		params = append(params, start.UTC())
	} else {
		dbQueryStr += " AND DATETIME(start_time) > '01-01-2019 00:00:00'"
	}
	// end date
	if end != nil {
		dbQueryStr += " AND DATETIME(end_time) <= ?"
		params = append(params, end.UTC())
	}
	// limit, offset
	dbQueryStr += " ORDER BY DATETIME(start_time) DESC LIMIT ? OFFSET ?"
	params = append(params, app.PastEncounterFetchLimit, offset)
	// fetch encounters
	rows, err := db.Query(
		dbQueryStr,
		params...,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	// build encounter datas
	for rows.Next() {
		// build encounter
		encounter := act.Encounter{}
		err := rows.Scan(
			&encounter.UID,
			&encounter.ActID,
			&encounter.CompareHash,
			&encounter.StartTime,
			&encounter.EndTime,
			&encounter.Zone,
			&encounter.Damage,
			&encounter.SuccessLevel,
			&encounter.HasLogs,
		)
		if err != nil {
			return err
		}
		*encounters = append(*encounters, encounter)
	}
	return nil
}

// FindEncounterCount - get total number of results from encounter query
func FindEncounterCount(userID int, query string, start *time.Time, end *time.Time, db *sql.DB, res *int) error {
	// build query
	params := make([]interface{}, 1)
	params[0] = userID
	dbQueryStr := "SELECT COUNT(DISTINCT(uid)) FROM encounter INNER JOIN combatant ON combatant.encounter_uid = encounter.uid"
	dbQueryStr += " INNER JOIN player ON player.id = combatant.player_id"
	dbQueryStr += " WHERE DATETIME(end_time) > DATETIME(start_time)"
	dbQueryStr += " AND encounter.user_id = ?"
	// search string
	if query != "" {
		dbQueryStr += " AND (zone LIKE ? OR player.name LIKE ?)"
		params = append(params, "%"+query+"%", "%"+query+"%")
	}
	// start date
	if start != nil {
		dbQueryStr += " AND DATETIME(start_time) >= ?"
		params = append(params, start.UTC())
	} else {
		dbQueryStr += " AND DATETIME(start_time) > '01-01-2019 00:00:00'"
	}
	// end date
	if end != nil {
		dbQueryStr += " AND DATETIME(end_time) <= ?"
		params = append(params, end.UTC())
	}
	// fetch encounter counter
	rows, err := db.Query(
		dbQueryStr,
		params...,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	// retrieve count
	for rows.Next() {
		err = rows.Scan(
			res,
		)
		if err != nil {
			return err
		}
	}
	return nil
}

// TotalCountEncounter - get total encounter count
func TotalCountEncounter(db *sql.DB, res *int) error {
	rows, err := db.Query(
		`SELECT COUNT(*) FROM encounter WHERE DATETIME(start_time) > '01-01-2019 00:00:00'`,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil
	}
	err = rows.Scan(
		res,
	)
	return err
}

// FindEncounterNeedClean - find encounters that need clean up
func FindEncounterNeedClean(db *sql.DB, encounterUIDs *[]string) error {
	cleanUpDate := time.Now().Add(time.Duration(-app.EncounterCleanUpDays*24) * time.Hour)
	rows, err := db.Query(
		"SELECT uid FROM encounter WHERE DATETIME(start_time) < ? AND has_logs LIMIT 100",
		cleanUpDate,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var uid sql.NullString
		err = rows.Scan(
			&uid,
		)
		if err != nil || !uid.Valid {
			continue
		}
		*encounterUIDs = append(*encounterUIDs, uid.String)
	}
	return nil
}

// FlagEncounterClean - flag encounter as cleaned
func FlagEncounterClean(encounterUID string, db *sql.DB) error {
	stmt, err := db.Prepare(`
		UPDATE encounter SET has_logs = 0 WHERE uid = ?
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	_, err = stmt.Exec(
		encounterUID,
	)
	return err
}
