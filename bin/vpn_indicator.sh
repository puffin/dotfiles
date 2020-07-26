#!/bin/bash

if scutil --nc list | grep Connected; then
	echo -n "#[default,bg=default,fg=#A2F644]#[bold]VPN#[nobold]"
else
	echo -n "#[default,bg=default,fg=#505050]VPN"
fi
