import ctypes
import unittest
from ctypes import wintypes

from isolator.winapi import CPU_SET_DATA, SYSTEM_CPU_SET_INFORMATION, ntdll


class WinapiLayoutTests(unittest.TestCase):
    def test_cpu_set_data_matches_windows_sdk_layout_on_x64(self):
        self.assertEqual(24, ctypes.sizeof(CPU_SET_DATA))
        self.assertEqual(12, CPU_SET_DATA.SchedulingClass.offset)
        self.assertEqual(12, CPU_SET_DATA.Reserved.offset)
        self.assertEqual(16, CPU_SET_DATA.AllocationTag.offset)

    def test_system_cpu_set_information_matches_windows_sdk_layout_on_x64(self):
        self.assertEqual(32, ctypes.sizeof(SYSTEM_CPU_SET_INFORMATION))
        self.assertEqual(8, SYSTEM_CPU_SET_INFORMATION.CpuSet.offset)

    def test_nt_set_timer_resolution_set_flag_is_boolean_byte(self):
        self.assertIs(wintypes.BOOLEAN, ntdll.NtSetTimerResolution.argtypes[1])
        self.assertEqual(1, ctypes.sizeof(ntdll.NtSetTimerResolution.argtypes[1]))


if __name__ == "__main__":
    unittest.main()
