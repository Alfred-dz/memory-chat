#!/bin/bash
MBIN=/usr/local/mysql/bin
$MBIN/mysqladmin -uroot -pSz031002+ shutdown 2>/dev/null || true
sleep 2
systemctl stop mysql 2>/dev/null || true
$MBIN/mysqld_safe --skip-grant-tables &
sleep 4
$MBIN/mysql -e "FLUSH PRIVILEGES; ALTER USER 'root'@'localhost' IDENTIFIED BY 'Sz031002+';"
killall mysqld 2>/dev/null || true
sleep 2
systemctl start mysql
sleep 3
$MBIN/mysql -uroot -pSz031002+ -e "CREATE DATABASE IF NOT EXISTS tlias DEFAULT CHARACTER SET utf8mb4; SHOW DATABASES;"
echo "MYSQL_DONE"
