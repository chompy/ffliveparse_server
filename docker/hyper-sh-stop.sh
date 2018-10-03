#!/bin/sh

hyper stop ffliveparse-nginx
hyper rm ffliveparse-nginx
hyper stop ffliveparse-app
hyper rm ffliveparse-app
hyper stop ffliveparse-mysql
hyper rm ffliveparse-mysql
