
// Copyright 2010 Alon Zakai ('kripken'). All rights reserved.
// This file is part of Syntensity/the Intensity Engine, an open source project. See COPYING.txt for licensing.

// Should reflect ents.h
CLIENTSTATE = {
    ALIVE: 0,
    DEAD: 1, // unused by us
    SPAWNING: 2, // unused by us
    LAGGED: 3,
    EDITING: 4,
    SPECTATOR: 5
};

// Should reflect ents.h
PHYSICALSTATE = {
    FLOAT: 0,
    FALL: 1, 
    SLIDE: 2, 
    SLOPE: 3, 
    FLOOR: 4, 
    STEP_UP: 5, 
    STEP_DOWN: 6, 
    BOUNCE: 7
};

//! Either a Player Character (PC) or a Non-Player Character (NPC). A figure that has attachments, can move, etc.
Character = AnimatableLogicEntity.extend({
    _class: "Character",

    //! Characters correspond to the 'fpsent' Sauer type
    _sauerType: "fpsent",

    //== State variables

    //! The nickname of this player. Shown on the 'scoreboard', messages, etc.
    _name: new StateString(),

    //! How fast the entity can change facing (yaw and pitch), in degrees/second
    facingSpeed: new StateInteger(),

    //== dynent variables, reflected from Sauer

    //! The maximum movement speed. 20 is slow, 60 is quite fast.
    movementSpeed: new WrappedCFloat({ cGetter: 'CAPI.getMaxSpeed', cSetter: 'CAPI.setMaxSpeed' }),

    //! The yaw (azimuth, facing direction) of the character, in (float) degrees
    yaw: new WrappedCFloat({ cGetter: 'CAPI.getYaw', cSetter: 'CAPI.setYaw', customSynch: true }),

    //! The pitch (looking up or down) of the character, in (float) degrees
    pitch: new WrappedCFloat({ cGetter: 'CAPI.getPitch', cSetter: 'CAPI.setPitch', customSynch: true }),

    //! The *intention* to move. -1 is the same as a player pressing 'back'; 0 is not pressing; +1 is pressing 'forward'.
    move: new WrappedCInteger({ cGetter: 'CAPI.getMove', cSetter: 'CAPI.setMove', customSynch: true }),

    //! The *intention* to strafe. -1 is the same as a player pressing 'strafe left'; 0 is not pressing; +1 is pressing 'strafe right'.
    strafe: new WrappedCInteger({ cGetter: 'CAPI.getStrafe', cSetter: 'CAPI.setStrafe', customSynch: true }),

//    //! The *intention* to yaw.
//    yawing: new WrappedCInteger({ cGetter: 'CAPI.getYawing', cSetter: 'CAPI.setYawing', customSynch: true }),
// TODO: Enable these. But they do change the protocol, so forces everyone and everything to upgrade
//    //! The *intention* to pitch.
//    pitching: new WrappedCInteger({ cGetter: 'CAPI.getPitching', cSetter: 'CAPI.setPitching', customSynch: true }),

    //! The position of the character. This location is in Sauerbraten by convention at the top of the head.
    position: new WrappedCVector3({ cGetter: 'CAPI.getDynentO', cSetter: 'CAPI.setDynentO', customSynch: true }),

    //! The velocity of the character.
    velocity: new WrappedCVector3({ cGetter: 'CAPI.getDynentVel', cSetter: 'CAPI.setDynentVel', customSynch: true }),

    //! The falling velocity of the character.
    falling: new WrappedCVector3({ cGetter: 'CAPI.getDynentFalling', cSetter: 'CAPI.setDynentFalling', customSynch: true }),

    //! The radius of the character's bounding box.
    radius: new WrappedCFloat({ cGetter: 'CAPI.getRadius', cSetter: 'CAPI.setRadius' }),

    //! The distance from 'position' to the character's eyes (typically small), i.e., height of the character above its eyes.
    aboveEye: new WrappedCFloat({ cGetter: 'CAPI.getAboveeye', cSetter: 'CAPI.setAboveeye' }),

    //! The distance from the character's eyes (position-above_eye) to the character's feet (typically large),
    //! i.e., the height of the eyes above the ground.
    eyeHeight: new WrappedCFloat({ cGetter: 'CAPI.getEyeHeight', cSetter: 'CAPI.setEyeHeight' }),

    //! Whether on the last movement cycle this character was blocked by something, i.e.,
    //! the physics system has it colliding with an obstacle. Note that the floor doesn't count as
    //! an obstacle.
    blocked: new WrappedCBoolean({ cGetter: 'CAPI.getBlocked', cSetter: 'CAPI.setBlocked' }),

    //! Whether this entity can move
    canMove: new WrappedCBoolean({ cSetter: 'CAPI.setCanMove', clientSet: true }),

    //! Position protocol data specific to the current map, see fpsent. TODO: Make unsigned
    mapDefinedPositionData: new WrappedCInteger({
        cGetter: 'CAPI.getMapDefinedPositionData',
        cSetter: 'CAPI.setMapDefinedPositionData',
        customSynch: true
    }),

    //! Client state: editing, spectator, lagged, etc
    clientState: new WrappedCInteger({ cGetter: 'CAPI.getClientState', cSetter: 'CAPI.setClientState', customSynch: true }),

    //! Physical state: Falling, sliding, etc.
    physicalState: new WrappedCInteger({ cGetter: 'CAPI.getPhysicalState', cSetter: 'CAPI.setPhysicalState', customSynch: true }),

    //! Whether inside water or not
    inWater: new WrappedCInteger({ cGetter: 'CAPI.getInWater', cSetter: 'CAPI.setInWater', customSynch: true }),

    //! See dynent
    timeInAir: new WrappedCInteger({ cGetter: 'CAPI.getTimeInAir', cSetter: 'CAPI.setTimeInAir', customSynch: true }),

    //== dynent functions

    //! When called, sets the intention to jump in the air, immediately.
    jump: function() {
        CAPI.setJumping(this, true);
    },

    //== Main stuff

    init: function(uniqueId, kwargs) {
        log(DEBUG, "Character.init");

        this._super(uniqueId, kwargs);

        this._name = '-?-'; // Set by the server later

        //! The client number in our server, a unique identifier of currently connected clients. Can change between
        //! sessions, unlike unique_ids. Client numbers can be in general much smaller than unique_ids, and in that way
        //! can lessen bandwidth, especially since they are sent around quite a lot.
        //!
        //! -1 as the client number means that this client is not yet logged in, e.g., if it is a just-created NPC.
        //! in that case, we will do a localconnect in LogicSystem::setupCharacter
        this.clientNumber = kwargs !== undefined ? (kwargs.clientNumber !== undefined ? kwargs.clientNumber : -1) : -1; // XXX Needed? See activate.

        // Some reasonable defaults
        this.modelName = "stromar";
        this.eyeHeight = 14;
        this.aboveEye = 1;
        this.movementSpeed = 50;
        this.facingSpeed = 120;
        this.position = [512, 512, 550];
        this.radius = 3.0;
        this.canMove = true;
    },

    activate: function(kwargs) {
        log(DEBUG, "Character.activate");

        // If we have been given a client number as our parameters, apply that
        this.clientNumber = kwargs !== undefined ? (kwargs.clientNumber !== undefined ? kwargs.clientNumber : -1) : -1;
        eval(assert(' this.clientNumber >= 0 ')); // Must use newNPC!

        CAPI.setupCharacter(this); // Creates or connects with the fpsent for this entity, does C++ registration, etc.

        this._super(kwargs); // Done after setupCharacter, which gives us a client number, which activate then uses

        this._flushQueuedStateVariableChanges();

        log(DEBUG, "Character.activate complete");
    },

    clientActivate: function(kwargs) {
        this._super(kwargs);

        // If we have been given a client number as our parameters, apply that
        this.clientNumber = kwargs !== undefined ? (kwargs.clientNumber !== undefined ? kwargs.clientNumber : -1) : undefined;

        CAPI.setupCharacter(this); // Creates or connects with the fpsent for this entity, does C++ registration, etc.

        //! See usage in renderDynamic - this helps us not create the rendering args multiple times in each frame
        this.renderingArgsTimestamp = -1;
    },

    deactivate: function() {
//        print "Character.deactivate"

        CAPI.dismantleCharacter(this);

        this._super();
    },

    clientDeactivate: function() {
//        print "Character.client_deactivate"

        CAPI.dismantleCharacter(this);

        this._super();
    },

    //! Think and act for a time period of seconds seconds. If there are actions, do them, otherwise do some default, as specified in
    //! 'default_action'. This can further be overridden to do some checking even if there are pending actions, to see if there is
    //! something more important to be done which would justify cancelling them, and so forth.
    //! @param seconds The length of time to simulate.
    act: function(seconds) {
        if (this.actionSystem.isEmpty()) {
            this.defaultAction(seconds);
        } else {
            this._super(seconds);
        }
    },

    //! Overridden to provide some default activity when no pending action. For example, this could do some thinking and decide on
    //! the next action to be queued
    //! @param seconds The length of time to simulate.
    defaultAction: function(seconds) {
    },

    //! All characters are rendering using renderDynamic in scripting, which allows for easy
    //! extension (e.g., to utilize mapDefinedPositionData)
    //! @param HUDPass: If we are rendering the HUD right now
    //! @param needHUD: If this model should be shown as a HUD model (it is us, and we are in first person).
    renderDynamic: function(HUDPass, needHUD) {
        if (!this.initialized) {
            return;
        }

        if (!HUDPass && needHUD) return;

        if (this.renderingArgsTimestamp !== currTimestamp) {
            // Same naming conventions as in rendermodel.cpp in sauer

            var state = this.clientState;

            if (state == CLIENTSTATE.SPECTATOR || state == CLIENTSTATE.SPAWNING) {
                return;
            }

            var mdlname = HUDPass && needHUD ? this.HUDModelName : this.modelName;
            var yaw = this.yaw + 90;
            var pitch = this.pitch;
            var o = this.position.copy();
            var basetime = this.startTime;
            var physstate = this.physicalState;
            var inwater = this.inWater;
            var move = this.move;
            var strafe = this.strafe;
            var vel = this.velocity.copy();
            var falling = this.falling.copy();
            var timeinair = this.timeInAir;
            var anim = this.decideAnimation(state, physstate, move, strafe, vel, falling, inwater, timeinair);

            var flags = MODEL.LIGHT;
            if (this !== getPlayerEntity()) {
                flags |= MODEL.CULL_VFC | MODEL.CULL_OCCLUDED | MODEL.CULL_QUERY;
            }
            flags |= MODEL.FULLBRIGHT; // TODO: For non-characters, use: flags |= MODEL.CULL_DIST;
            var fade = 1.0;
            if (state == CLIENTSTATE.LAGGED) {
                fade = 0.3;
            } else {
                flags |= MODEL.DYNSHADOW;
            }

            this.renderingArgs = [this, mdlname, anim, o.x, o.y, o.z, yaw, pitch, flags, basetime];
            this.renderingArgsTimestamp = currTimestamp;
        }

        CAPI.renderModel.apply(this, this.renderingArgs);
    },

    //! Select the animation to show for this character. Can be overridden
    //! if desired, but typically you would only override decideActionAnimation.
    decideAnimation: function(state, physstate, move, strafe, vel, falling, inwater, timeinair) {
        // Same naming conventions as in rendermodel.cpp in sauer

        var anim = this.decideActionAnimation();

        if (state == CLIENTSTATE.EDITING || state == CLIENTSTATE.SPECTATOR) {
            anim = ANIM_EDIT | ANIM_LOOP;
        } else if (state == CLIENTSTATE.LAGGED) {
            anim = ANIM_LAG | ANIM_LOOP;
        } else {
            if(inwater && physstate<=PHYSICALSTATE.FALL) {
                anim |= (((move || strafe) || vel.z+falling.z>0 ? ANIM_SWIM : ANIM_SINK) | ANIM_LOOP) << ANIM_SECONDARY;
            } else if (timeinair>250) {
                anim |= (ANIM_JUMP|ANIM_END) << ANIM_SECONDARY;
            } else if (move || strafe) 
            {
                if (move>0) {
                    anim |= (ANIM_FORWARD | ANIM_LOOP) << ANIM_SECONDARY;
                } else if (strafe) {
                    anim |= ((strafe>0 ? ANIM_LEFT : ANIM_RIGHT)|ANIM_LOOP) << ANIM_SECONDARY;
                } else if (move<0) {
                    anim |= (ANIM_BACKWARD | ANIM_LOOP) << ANIM_SECONDARY;
                }
            }

            if ( (anim & ANIM_INDEX) == ANIM_IDLE && ((anim >> ANIM_SECONDARY) & ANIM_INDEX)) {
                anim >>= ANIM_SECONDARY;
            }
        }

        if(!((anim >> ANIM_SECONDARY) & ANIM_INDEX)) {
            anim |= (ANIM_IDLE | ANIM_LOOP) << ANIM_SECONDARY;
        }

        return anim;
    },

    //! Select the 'action' animation to show. This does not take into account
    //! effects like lag, water, etc., which are handled in decideAnimation.
    //! By default this function simply returns this.animation. It can be
    //! overridden to do something more complex, e.g., taking into account
    //! map-specific information in mapDefinedPositionData.
    decideActionAnimation: function() {
        return this.animation;
    },

    //! @return The 'center' of the character, something like the center of gravity,
    //!         typically people and AI would aim at this point, and not at 'position',
    //!         which is the feet position. Override this function if the 'center'
    //!         is defined in a nonstandard way (default is 0.75*eyeheight above feet).
    getCenter: function() {
        var ret = this.position.copy();
        ret.z += this.eyeHeight*0.75;
        return ret;
    },
});


//! Player Character (PC). The default class used for PCs, if not otherwise set by the application.
Player = Character.extend({
    _class: "Player",
    _canEdit: new StateBoolean(),

    init: function(uniqueId, kwargs) {
        log(DEBUG, "Player.init");
        this._super(uniqueId, kwargs);

        this._canEdit = false; // Set to true by the server if it should be true
    },

    clientActivate: function(kwargs) {
        this._super(kwargs);
    },
});


//
// Register classes
//

registerEntityClass(Character, "dynent");
registerEntityClass(Player, "dynent");

