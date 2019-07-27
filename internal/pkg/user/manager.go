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

package user

import (
	"fmt"

	"github.com/olebedev/emitter"

	_ "github.com/mattn/go-sqlite3" // sqlite driver
)

// Manager - manages users data
type Manager struct {
	Events *emitter.Emitter
}

// New - create a new user
func (m *Manager) New() Data {
	ud := NewData()
	m.Save(&ud)
	return ud
}

// LoadFromID - load user from id
func (m *Manager) LoadFromID(ID int64) (Data, error) {
	fin := make(chan bool)
	ud := Data{}
	m.Events.Emit(
		"database:fetch",
		fin,
		&ud,
		int(ID),
	)
	<-fin
	if ud.ID == 0 {
		return Data{}, fmt.Errorf("could not find user data with ID %d", ID)
	}
	return ud, nil
}

// LoadFromUploadKey - load user from upload key
func (m *Manager) LoadFromUploadKey(uploadKey string) (Data, error) {
	fin := make(chan bool)
	ud := make([]Data, 0)
	m.Events.Emit(
		"database:find",
		fin,
		&ud,
		"",        // event arg 1 == web key
		uploadKey, // event arg 2 == upload key
	)
	<-fin
	if len(ud) == 0 {
		return Data{}, fmt.Errorf("could not find user data with upload key %s", uploadKey)
	}
	return ud[0], nil
}

// LoadFromWebKey - load user from web key
func (m *Manager) LoadFromWebKey(webKey string) (Data, error) {
	fin := make(chan bool)
	ud := make([]Data, 0)
	m.Events.Emit(
		"database:find",
		fin,
		&ud,
		webKey, // event arg 1 == web key
		"",     // event arg 2 == upload key
	)
	<-fin
	if len(ud) == 0 {
		return Data{}, fmt.Errorf("could not find user data with web key %s", webKey)
	}
	return ud[0], nil
}

// LoadFromWebIDString - load user from web ID string
func (m *Manager) LoadFromWebIDString(webIDString string) (Data, error) {
	userID, err := GetIDFromWebIDString(webIDString)
	if err != nil {
		return Data{}, err
	}
	return m.LoadFromID(userID)
}

// Save - save user data
func (m *Manager) Save(ud *Data) {
	fin := make(chan bool)
	m.Events.Emit(
		"database:save",
		fin,
		ud,
	)
	<-fin
}
