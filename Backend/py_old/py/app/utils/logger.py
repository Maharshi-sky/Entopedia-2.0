import logging
import os
import sys

_LEVEL = os.getenv("LOG_LEVEL", "info").upper()

logger = logging.getLogger("entopedia-api")
logger.setLevel(_LEVEL)

_file_handler = logging.FileHandler("combined.log", encoding="utf-8")
_file_handler.setLevel(logging.DEBUG)
_file_handler.setFormatter(logging.Formatter('{"time":"%(asctime)s","level":"%(levelname)s","message":"%(message)s"}'))
logger.addHandler(_file_handler)

_error_handler = logging.FileHandler("error.log", encoding="utf-8")
_error_handler.setLevel(logging.ERROR)
_error_handler.setFormatter(logging.Formatter('{"time":"%(asctime)s","level":"%(levelname)s","message":"%(message)s"}'))
logger.addHandler(_error_handler)

if os.getenv("NODE_ENV") != "production":
    _console_handler = logging.StreamHandler(sys.stdout)
    _console_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s]: %(message)s"))
    logger.addHandler(_console_handler)
