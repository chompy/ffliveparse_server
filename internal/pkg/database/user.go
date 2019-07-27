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

	"../user"
)

// CreateUserTable - create user database table
func CreateUserTable(db *sql.DB) error {
	stmt, err := db.Prepare(`
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

// SaveUser - save user to database
func SaveUser(user *user.Data, db *sql.DB) error {
	stmt, err := db.Prepare(`
		REPLACE INTO user
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

// FetchUser - fetch user from database
func FetchUser(userID int, db *sql.DB, user *user.Data) error {
	rows, err := db.Query(
		`SELECT id, created, accessed, upload_key, web_key FROM user WHERE id = ? LIMIT 1`,
		userID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil
	}
	err = rows.Scan(
		&user.ID,
		&user.Created,
		&user.Accessed,
		&user.UploadKey,
		&user.WebKey,
	)
	return err
}

// FindUsers - find user with upload key or web key
func FindUsers(webKey string, uploadKey string, db *sql.DB, users *[]user.Data) error {
	rows, err := db.Query(
		`SELECT id, created, accessed, upload_key, web_key FROM user 
			WHERE (web_key != "" AND web_key = ?) OR (upload_key != "" AND upload_key = ?)`,
		webKey,
		uploadKey,
	)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		user := user.Data{}
		err = rows.Scan(
			&user.ID,
			&user.Created,
			&user.Accessed,
			&user.UploadKey,
			&user.WebKey,
		)
		if err != nil {
			return err
		}
		*users = append(*users, user)
	}
	return nil
}

// TotalCountUser - get total user count
func TotalCountUser(db *sql.DB, res *int) error {
	rows, err := db.Query(
		`SELECT COUNT(*) FROM user`,
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
