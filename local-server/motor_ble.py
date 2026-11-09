"""Motor GATT extension for the local Notif host. Never generates movement/heartbeats."""
import asyncio
import json
import sys
from bleak import BleakClient, BleakScanner

SERVICE = 'b4c00001-70f0-4c21-a560-cc0100000001'
COMMAND = 'b4c00002-70f0-4c21-a560-cc0100000001'
STATUS = 'b4c00003-70f0-4c21-a560-cc0100000001'
PATTERNS = 'b4c00004-70f0-4c21-a560-cc0100000001'

class MotorBridge:
    def __init__(self, scanner=BleakScanner, client_factory=BleakClient):
        self.scanner, self.client_factory = scanner, client_factory
        self.devices, self.client = {}, None

    async def close(self):
        client, self.client = self.client, None
        if client:
            await asyncio.wait_for(client.disconnect(), 2)

    async def handle(self, request):
        op = request['op']
        if op == 'scan':
            if self.client:
                raise ValueError('接続中は検索できません。先に切断してください。')
            found = await self.scanner.discover(timeout=4, service_uuids=[SERVICE])
            self.devices = {device.address: device for device in found}
            return [{'id': d.address, 'name': d.name or 'Colon-Motor-Test'} for d in found]
        if op == 'connect':
            if self.client:
                raise ValueError('他の画面が接続中です。先に切断してください。')
            device = self.devices.get(request.get('device'))
            if not device:
                raise ValueError('検索したAtomを選んでください。')
            self.client = self.client_factory(device)
            try:
                await asyncio.wait_for(self.client.connect(), 10)
                status = await self.handle({'op': 'read'})
                if status.get('firmware') not in ('colon-motor-1.8.0', 'colon-motor-1.9.0'):
                    raise ValueError('モーター用1.9.0（または復元用1.8.0）のAtomを選んでください。')
                return status
            except Exception:
                await self.close()
                raise
        if op == 'disconnect':
            await self.close()
            return None
        if not self.client or not self.client.is_connected:
            raise ValueError('Atomへのサーバー接続が切れています。')
        if op in ('read', 'patterns'):
            raw = await asyncio.wait_for(self.client.read_gatt_char(STATUS if op == 'read' else PATTERNS, use_cached=False), 1.5)
            return json.loads(bytes(raw).decode('utf-8'))
        if op == 'write':
            data = request.get('frame')
            if not isinstance(data, list) or len(data) != 20 or any(type(x) is not int or not 0 <= x <= 255 for x in data):
                raise ValueError('不正なモーター指令です。')
            if data[0] != 1 or not 1 <= data[1] <= 10:
                raise ValueError('未対応のモーター指令です。')
            await asyncio.wait_for(self.client.write_gatt_char(COMMAND, bytes(data), response=True), 1.5)
            return None
        raise ValueError('未対応の操作です。')

async def main():
    bridge = MotorBridge()
    try:
        while True:
            line = await asyncio.to_thread(sys.stdin.readline)
            if not line:
                break
            request = {}
            try:
                request = json.loads(line)
                result = await bridge.handle(request)
                response = {'id': request['id'], 'result': result}
            except Exception as error:
                response = {'id': request.get('id'), 'error': str(error) or type(error).__name__}
            print(json.dumps(response, ensure_ascii=True), flush=True)
    finally:
        await bridge.close()

if __name__ == '__main__':
    asyncio.run(main())
