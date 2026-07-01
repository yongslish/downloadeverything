"""Run the optional XHS-Downloader API on loopback only.

The Node service uses this as a local, private provider.  It intentionally
does not bind to a LAN or public interface.
"""

import asyncio
import os

from source import Settings, XHS


async def main() -> None:
    host = os.environ.get("XHS_BIND_HOST", "127.0.0.1")
    port = int(os.environ.get("XHS_API_PORT", "5556"))
    async with XHS(**Settings().run()) as xhs:
        await xhs.run_api_server(host=host, port=port, log_level="warning")


if __name__ == "__main__":
    asyncio.run(main())
