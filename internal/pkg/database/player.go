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

	"../act"
)

// CreatePlayerTable - create player database table
func CreatePlayerTable(db *sql.DB) error {
	stmt, err := db.Prepare(`
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

// SavePlayer - save player to database
func SavePlayer(player *act.Player, db *sql.DB) error {
	insStmt, err := db.Prepare(`
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
		updateStmt, err := db.Prepare(`
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
	return nil
}

// FetchPlayer - fetch player from database
func FetchPlayer(id int, db *sql.DB, player *act.Player) error {
	return nil
}

// TotalCountPlayer - get total player count
func TotalCountPlayer(db *sql.DB, res *int) error {
	rows, err := db.Query(
		`SELECT COUNT(*) FROM player`,
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
