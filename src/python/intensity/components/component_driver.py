
#=============================================================================
# Copyright 2008 Alon Zakai ('Kripken') kripkensteiner@gmail.com
#
# This file is part of the Intensity Engine project,
#    http://www.intensityengine.com
#
# The Intensity Engine is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, version 3.
#
# The Intensity Engine is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with the Intensity Engine.  If not, see
#     http://www.gnu.org/licenses/
#     http://www.gnu.org/licenses/agpl-3.0.html
#=============================================================================


import threading, time
from multiprocessing import Process
from multiprocessing import Queue

from intensity.base import *
from intensity.logging import *
from intensity.signals import signal_component


## A general framework for a component, run in a separate process
class ComponentDriver:
    class RESPONSE:
        Callback = 0
        Error = 1

    def __init__(self, name, component_main, keep_alive_always=False, keep_alive_when_outgoing=False):
        self.name = name
        self.component_main = component_main
        self.keep_alive_always = keep_alive_always
        self.keep_alive_when_outgoing = keep_alive_when_outgoing

        self.to_component = Queue()
        self.from_component = Queue()

        self.proc = None
        self.kickstart()

        thread = threading.Thread(target=self.main_loop)
        thread.setDaemon(True)
        thread.start()

        if self.keep_alive_always or self.keep_alive_when_outgoing:
            thread = threading.Thread(target=self.keepalive_loop)
            thread.setDaemon(True)
            thread.start()

        signal_component.connect(self.receive, weak=False)

    def kickstart(self):
        try:
            self.proc.terminate()
        except:
            pass
        self.proc = Process(target=self.component_main, args=(self.to_component, self.from_component))
        self.proc.daemon = True
        self.proc.start()

    def main_loop(self):
        while True:
            print "Seek something..."
            response_type, data = self.from_component.get()
            print "Got from compontn", callback, param

            if response_type == ComponentDriver.RESPONSE.Callback:
                callback, param = data
                CModule.run_script('Tools.callbacks.tryCall("%s", "%s%")' % callback, param)
            elif response_type == ComponentDriver.RESPONSE.Error:
                CModule.show_message('Error in %s component: %s' % (self.name, data))

    def keepalive_loop(self):
        while True:
            time.sleep(1.0)

            # Restart
            if not self.proc.is_alive() and (self.keep_alive_always or (self.keep_alive_when_outgoing and not self.to_component.empty())):
                print "kickstart:", self.name
                self.kickstart()
                continue

    def receive(self, sender, **kwargs):
        component_id = kwargs['component_id']
        data = kwargs['data']

        print "C,D:", component_id, data

        try:
            if component_id == self.name:
                parts = data.split('|')
                command = parts[0]
                params = '|'.join(parts[1:])
                self.to_component.put_nowait((command, params))
        except Exception, e:
            log(logging.ERROR, "Error in %s component: %s" + (self.name, str(e)))

        return ''
