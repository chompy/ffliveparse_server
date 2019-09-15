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

	"../app"
	"../data"
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
func SaveEncounter(userID int, encounter *data.Encounter, db *sql.DB) error {
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
func FetchEncounter(userID int, encounterUID string, db *sql.DB, encounter *data.Encounter) error {
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
		var compareHash sql.NullString
		err = rows.Scan(
			&encounter.UID,
			&encounter.ActID,
			&compareHash,
			&encounter.StartTime,
			&encounter.EndTime,
			&encounter.Zone,
			&encounter.Damage,
			&encounter.SuccessLevel,
		)
		if err != nil {
			return err
		}
		if compareHash.Valid {
			encounter.CompareHash = compareHash.String
		}
		break
	}
	return nil
}

// FindEncounters - find encounters with given parameters
func FindEncounters(
	userID int,
	offset int,
	query string,
	start *time.Time,
	end *time.Time,
	db *sql.DB,
	encounters *[]data.Encounter,
	totalResults *int,
) error {
	// build query
	params := make([]interface{}, 2)
	params[0] = userID
	params[1] = userID
	dbQueryStr := `
		SELECT DISTINCT(uid), act_id, compare_hash, start_time, end_time, zone, encounter.damage, success_level, has_logs,
		(SELECT COUNT(*) FROM encounter WHERE user_id = ?)
		FROM encounter INNER JOIN combatant ON combatant.encounter_uid = encounter.uid
		INNER JOIN player ON player.id = combatant.player_id
		WHERE DATETIME(end_time) > DATETIME(start_time)
		AND encounter.user_id = ?
	`
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
		encounter := data.Encounter{}
		var compareHash sql.NullString
		fetchTotalResults := 0
		err := rows.Scan(
			&encounter.UID,
			&encounter.ActID,
			&compareHash,
			&encounter.StartTime,
			&encounter.EndTime,
			&encounter.Zone,
			&encounter.Damage,
			&encounter.SuccessLevel,
			&encounter.HasLogs,
			&fetchTotalResults,
		)
		if err != nil {
			return err
		}
		if totalResults != nil {
			*totalResults = fetchTotalResults
		}
		if compareHash.Valid {
			encounter.CompareHash = compareHash.String
		}
		*encounters = append(*encounters, encounter)
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

// FindEncounterLogClean - find encounters that need log delete
func FindEncounterLogClean(db *sql.DB, encounterUIDs *[]string) error {
	cleanUpDate := time.Now().Add(time.Duration(-app.EncounterLogDeleteDays*24) * time.Hour)
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

// FlagEncounterLogClean - flag encounter as having the log deleted
func FlagEncounterLogClean(encounterUID string, db *sql.DB) error {
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

// EncounterClean - delete old encounters
func EncounterClean(rows *int64, db *sql.DB) error {
	// delete encounters older then EncounterDeleteDays days
	cleanUpDate := time.Now().Add(time.Duration(-app.EncounterDeleteDays*24) * time.Hour)
	res, err := db.Exec(
		"DELETE FROM encounter WHERE DATETIME(start_time) < ? AND NOT has_logs",
		cleanUpDate,
	)
	if err != nil {
		return err
	}
	*rows, err = res.RowsAffected()
	if err != nil {
		return err
	}
	// delete all combatants that don't have an encounter
	_, err = db.Exec(
		"DELETE FROM combatant WHERE (SELECT COUNT(*) FROM encounter WHERE uid = combatant.encounter_uid) = 0",
	)
	return err
}
