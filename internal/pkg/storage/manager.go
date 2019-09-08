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

import "time"

// Manager - manage object storage
type Manager struct {
	handlers []BaseHandler
	_lock    bool
}

// NewManager - create new storage manager
func NewManager() Manager {
	m := Manager{
		handlers: make([]BaseHandler, 0),
		_lock:    false,
	}
	return m
}

// AddHandler - add a storage handler
func (m *Manager) AddHandler(h BaseHandler) error {
	m.handlers = append(
		m.handlers,
		h,
	)
	return m.handlers[len(m.handlers)-1].Init()
}

// lock - lock writing
func (m *Manager) lock() {
	m._lock = true
}

// unlock - unlock writing
func (m *Manager) unlock() {
	m._lock = false
}

// IsLocked - check lock status
func (m *Manager) IsLocked() bool {
	return m._lock
}

// Store - store object
func (m *Manager) Store(data []interface{}) error {
	// wait
	for m.IsLocked() {
		time.Sleep(time.Millisecond * 5)
	}
	// lock
	m.lock()
	defer m.unlock()
	// store
	for index := range m.handlers {
		err := m.handlers[index].Store(data)
		if err != nil {
			return err
		}
	}
	return nil
}

// FetchBytes - fetch stored object bytes
func (m *Manager) FetchBytes(params map[string]interface{}) ([][]byte, int, error) {
	output := make([][]byte, 0)
	totalCount := 0
	for index := range m.handlers {
		byteData, count, err := m.handlers[index].FetchBytes(params)
		if err != nil {
			return nil, 0, err
		}
		output = append(
			output,
			byteData,
		)
		totalCount += count
	}
	return output, totalCount, nil
}

// Fetch - fetch stored object
func (m *Manager) Fetch(params map[string]interface{}) ([]interface{}, int, error) {
	output := make([]interface{}, 0)
	totalCount := 0
	for index := range m.handlers {
		res, count, err := m.handlers[index].Fetch(params)
		if err != nil {
			return nil, 0, err
		}
		output = append(
			output,
			res...,
		)
		totalCount += count
	}
	return output, totalCount, nil
}
