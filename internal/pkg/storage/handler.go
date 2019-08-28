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
)

// Handler - handle storage transactions
type Handler struct {
	database *sql.DB
}

// NewHandler - create new storage handler
func NewHandler() (Handler, error) {
	handler := Handler{}
	err := handler.Init()
	return handler, err
}

// Init - init the storage handler
func (h *Handler) Init() error {
	return nil
}
