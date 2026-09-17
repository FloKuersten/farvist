<template>
  <aside :class="{ 'd-none': hidden }">Vue binding: an expression, not a class list</aside>
  <p v-bind:class="{ 'fw-bold': bold, 'd-block': block }">Vue long form</p>
  <div x-bind:class="hidden && 'd-none'">Alpine</div>
  <div ng-class="{ 'd-none': hidden }">AngularJS</div>
  <div [class]="block ? 'd-block' : 'd-none'">Angular</div>
  <!-- <div class="flex items-center">commented-out markup is not checked</div> -->
  <div class="card"><div class="card-bdy">typo must be flagged</div></div>
</template>
