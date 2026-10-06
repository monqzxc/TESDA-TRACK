from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool
from sqlmodel import SQLModel

import tesda_track.models  # noqa: F401  (registers every table on SQLModel.metadata)
from tesda_track.config import get_settings

config = context.config

if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata
# PostGIS expression indexes are created by hand in migrations; SQLAlchemy can't model them.
HAND_WRITTEN_INDEX_SUFFIX = "_location_gist"
EXTENSION_TABLES = {"spatial_ref_sys"}  # owned by PostGIS, not by this app


def include_object(obj, name, type_, reflected, compare_to):
    if type_ == "index" and name and name.endswith(HAND_WRITTEN_INDEX_SUFFIX):
        return False
    return not (type_ == "table" and name in EXTENSION_TABLES)


def database_url() -> str:
    return config.get_main_option("sqlalchemy.url") or get_settings().database_url


def run_migrations_offline() -> None:
    context.configure(url=database_url(), target_metadata=target_metadata, literal_binds=True,
                      include_object=include_object, dialect_opts={"paramstyle": "named"}, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connection = config.attributes.get("connection")
    if connection is not None:  # supplied by tests
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True,
                          include_object=include_object)
        with context.begin_transaction():
            context.run_migrations()
        return
    with create_engine(database_url(), poolclass=pool.NullPool).connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True,
                          include_object=include_object)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
