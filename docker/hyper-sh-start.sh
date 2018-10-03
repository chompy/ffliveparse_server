#!/bin/sh

# mysql
hyper run \
    -d \
    -p 3306:3306 \
    --noauto-volume \
    --name ffliveparse-mysql \
    -h ffliveparse-mysql \
    --size s2 \
    -v ffliveparse-db:/var/lib/mysql \
    --env-file docker.env \
    ffliveparse-mysql

# app
hyper run \
    -d \
    -p 8081:8081 \
    -p 31593:31593/udp \
    --noauto-volume \
    --link ffliveparse-mysql \
    --name ffliveparse-app \
    -h ffliveparse-app \
    --size s1 \
    --env-file docker.env \
    ffliveparse-app

# nginx
hyper run \
    -d \
    -p 80:80 \
    -p 443:443 \
    -p 31593:31593/udp \
    --noauto-volume \
    --name ffliveparse-nginx \
    --link ffliveparse-app \
    -h ffliveparse-nginx \
    --size s2 \
    -v ffliveparse-ssl:/etc/letsencrypt \
    --env-file docker.env \
    ffliveparse-nginx
hyper fip attach 209.177.93.234 ffliveparse-nginx