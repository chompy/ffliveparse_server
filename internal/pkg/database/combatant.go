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

	"../data"
)

// CreateCombatantTable - create combatant database table
func CreateCombatantTable(db *sql.DB) error {
	stmt, err := db.Prepare(`
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

// SaveCombatant - save combatant to database
func SaveCombatant(userID int, combatant *data.Combatant, db *sql.DB) error {
	stmt, err := db.Prepare(`
		REPLACE INTO combatant
		(user_id, encounter_uid, player_id, time, job, damage, damage_taken, damage_healed, deaths, hits, heals, kills) VALUES
		(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	_, err = stmt.Exec(
		userID,
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
	return err
}

// FindEncounterCombatants - find all combatant records for an encounter
func FindEncounterCombatants(userID int, encounterUID string, db *sql.DB, combatants *[]data.Combatant) error {
	dbQueryStr := "SELECT player_id, time, job, damage, damage_taken, damage_healed, deaths, hits, heals, kills,"
	dbQueryStr += " player.name, player.act_name, player.world_name FROM combatant"
	dbQueryStr += " INNER JOIN player ON player.id = combatant.player_id WHERE user_id = ? AND encounter_uid = ?"
	dbQueryStr += " ORDER BY DATETIME(time) ASC"
	rows, err := db.Query(
		dbQueryStr,
		userID,
		encounterUID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	var worldName sql.NullString
	var actName sql.NullString
	var combatantTime NullTime
	for rows.Next() {
		player := data.Player{}
		combatant := data.Combatant{}
		combatant.EncounterUID = encounterUID
		err := rows.Scan(
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
		)
		if combatantTime.Valid {
			combatant.Time = combatantTime.Time
		}
		if worldName.Valid {
			player.World = worldName.String
		}
		if actName.Valid {
			player.ActName = actName.String
		}
		if err != nil {
			return err
		}
		combatant.Player = player
		*combatants = append(*combatants, combatant)
	}
	return nil
}

// TotalCountCombatant - get total combatant record count
func TotalCountCombatant(db *sql.DB, res *int) error {
	rows, err := db.Query(
		`SELECT COUNT(*) FROM combatant`,
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
