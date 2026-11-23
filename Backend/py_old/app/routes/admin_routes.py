from fastapi import APIRouter, Body, Depends, HTTPException

from app.db.connection import db
from app.middleware.auth import require_roles
from app.utils.logger import logger
from app.utils.range import to_interval

router = APIRouter(dependencies=[Depends(require_roles("admin"))])


@router.get("/users")
async def list_users(limit: int = 50, offset: int = 0):
    try:
        # `modules` lists the module names each user can open (access_level <> 'none').
        users = await db.query_many(
            """SELECT u.id, u.email, u.name, u.role, u.is_active, u.created_at,
                      COALESCE(ARRAY_AGG(m.name ORDER BY m.name) FILTER (WHERE m.id IS NOT NULL), '{}') AS modules,
                      COALESCE(ARRAY_AGG(DISTINCT ma.access_level) FILTER (WHERE ma.access_level IS NOT NULL), '{}') AS access_levels
                 FROM users u
                 LEFT JOIN module_access ma ON ma.user_id = u.id AND ma.access_level <> 'none'
                 LEFT JOIN modules m ON m.id = ma.module_id
                GROUP BY u.id
                ORDER BY u.created_at ASC
                LIMIT $1 OFFSET $2""",
            [limit, offset],
        )
        total = await db.query_one("SELECT COUNT(*) as count FROM users")

        return {"data": users, "pagination": {"limit": limit, "offset": offset, "total": total["count"] if total else 0}}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Users list error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch users")


@router.post("/users/{user_id}/access")
async def update_access(user_id: str, body: dict = Body(...)):
    try:
        module_id = body.get("module_id")
        access_level = body.get("access_level")

        await db.execute(
            "INSERT INTO module_access (user_id, module_id, access_level) VALUES ($1, $2, $3) ON CONFLICT (user_id, module_id) DO UPDATE SET access_level = $3",
            [user_id, module_id, access_level],
        )
        return {"message": "Access updated"}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Access update error: {error}")
        raise HTTPException(status_code=500, detail="Failed to update access")


@router.get("/users/{user_id}/access")
async def get_access(user_id: str):
    try:
        access = await db.query_many("SELECT module_id, access_level FROM module_access WHERE user_id = $1", [user_id])
        return {"access": access}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Access fetch error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch access")


@router.get("/modules")
async def list_modules():
    try:
        # "group" is a reserved word in SQL and must be quoted.
        modules = await db.query_many('SELECT id, name, slug, "group" FROM modules ORDER BY "group", name')
        return {"modules": modules}
    except Exception as error:  # noqa: BLE001
        logger.error(f"Modules list error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch modules")


@router.get("/usage-metrics")
async def usage_metrics(period: str = "30d"):
    try:
        interval = to_interval(period)

        active_users = await db.query_one(
            "SELECT COUNT(DISTINCT user_id)::int as count FROM ai_queries WHERE created_at > NOW() - $1::text::interval", [interval]
        )
        total_queries = await db.query_one(
            "SELECT COUNT(*)::int as count FROM ai_queries WHERE created_at > NOW() - $1::text::interval", [interval]
        )
        module_usage = await db.query_many(
            "SELECT module, COUNT(*)::int as count FROM ai_queries, UNNEST(modules) AS module WHERE created_at > NOW() - $1::text::interval GROUP BY module ORDER BY count DESC",
            [interval],
        )
        totals = await db.query_one(
            "SELECT (SELECT COUNT(*)::int FROM users WHERE is_active) AS active_accounts, (SELECT COUNT(*)::int FROM modules) AS modules_total"
        )

        return {
            "period": period,
            "active_users": active_users["count"] if active_users else 0,
            "total_queries": total_queries["count"] if total_queries else 0,
            "active_accounts": totals["active_accounts"] if totals else 0,
            "modules_total": totals["modules_total"] if totals else 0,
            "modules_active": len(module_usage),
            "module_usage": module_usage,
        }
    except Exception as error:  # noqa: BLE001
        logger.error(f"Usage metrics error: {error}")
        raise HTTPException(status_code=500, detail="Failed to fetch usage metrics")
