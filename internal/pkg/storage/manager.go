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
	"time"

	"../app"
)

// Manager - manage object storage
type Manager struct {
	log  app.Logging
	File FileHandler
	DB   SqliteHandler
}

// NewManager - create new storage manager
func NewManager() (Manager, error) {
	file, err := NewFileHandler(app.FileStorePath)
	if err != nil {
		return Manager{}, err
	}
	db, err := NewSqliteHandler(app.DatabasePath)
	if err != nil {
		return Manager{}, err
	}
	m := Manager{
		log:  app.Logging{ModuleName: "STORAGE"},
		File: file,
		DB:   db,
	}
	return m, nil
}

// StartCleanUp - start clean up process
func (m *Manager) StartCleanUp() {
	doClean := func() {
		m.log.Start("Begin clean up.")
		m.File.CleanUp()
		m.DB.CleanUp()
		m.log.Finish("Finish clean up.")
	}
	doClean()
	for range time.Tick(app.EncounterCleanUpRate * time.Millisecond) {
		doClean()
	}
}
