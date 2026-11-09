import unittest
from types import SimpleNamespace
from motor_ble import MotorBridge, SERVICE, COMMAND, STATUS

class Scanner:
    @staticmethod
    async def discover(**kwargs):
        assert kwargs['service_uuids'] == [SERVICE]
        return [SimpleNamespace(address='fake', name='Colon-Motor-Test')]
class Client:
    def __init__(self, device): self.is_connected=False; self.writes=[]
    async def connect(self): self.is_connected=True
    async def disconnect(self): self.is_connected=False
    async def read_gatt_char(self, uuid, *, use_cached):
        assert use_cached is False
        return b'{"firmware":"colon-motor-1.9.0"}'
    async def write_gatt_char(self, uuid, data, response):
        assert uuid == COMMAND and response is True
        self.writes.append(data)
class Tests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self): self.bridge=MotorBridge(Scanner,Client)
    async def asyncTearDown(self): await self.bridge.close()
    async def test_explicit_selection_and_no_startup_write(self):
        await self.bridge.handle({'op':'scan'})
        with self.assertRaises(ValueError): await self.bridge.handle({'op':'connect','device':'wrong'})
        await self.bridge.handle({'op':'connect','device':'fake'})
        self.assertEqual(self.bridge.client.writes,[])
    async def test_invalid_frames_and_disconnection(self):
        await self.bridge.handle({'op':'scan'});await self.bridge.handle({'op':'connect','device':'fake'})
        for frame in ([1,3], [1,3]+[0]*17+[True], [1,99]+[0]*18):
            with self.assertRaises(ValueError): await self.bridge.handle({'op':'write','frame':frame})
        await self.bridge.handle({'op':'write','frame':[1,4]+[0]*18})
        self.assertEqual(len(self.bridge.client.writes),1)
        await self.bridge.handle({'op':'disconnect'})
        with self.assertRaises(ValueError): await self.bridge.handle({'op':'read'})
if __name__ == '__main__': unittest.main()
