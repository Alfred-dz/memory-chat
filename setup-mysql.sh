#!/bin/bash
MBIN=/usr/local/mysql/bin
$MBIN/mysql -uroot -p'Sz031002+' -e "CREATE DATABASE IF NOT EXISTS tlias DEFAULT CHARACTER SET utf8mb4; SHOW DATABASES;"
echo "DONE"
