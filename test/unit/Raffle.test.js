const { network, ethers, deployments, getNamedAccounts } = require("hardhat")
const {
    developmentChains,
    networkConfig,
} = require("../../helper-hardhat-config")
const { assert, expect } = require("chai")
!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle unit test", function () {
          let raffle,
              raffleContract,
              vrfCoodrinatorV2Mock,
              raffleEntranceFee,
              interval,
              player
          beforeEach(async () => {
              accounts = await ethers.getSigners()
              player = accounts[1]
              await deployments.fixture(["mocks", "raffle"])
              vrfCoodrinatorV2Mock = await ethers.getContract(
                  "VRFCoordinatorV2Mock"
              )
              raffleContract = await ethers.getContract("Raffle") //起始raffle合约

              raffle = raffleContract.connect(player) //换player后的合约
              raffleEntranceFee = await raffle.getEntranceFee()
              interval = await raffle.getInterval()
              //console.log(interval.toNumber() + 1)
          })
          describe("constructor", function () {
              it("初始化raffle", async () => {
                  const raffleState = await raffle.getRaffleState()
                  assert.equal(raffleState, "0")
                  assert.equal(
                      interval,
                      networkConfig[network.config.chainId][
                          "keepersUpdateInterval"
                      ]
                  )
              })
          })
          describe("进入Raffle是否正确:", function () {
              it("若ETH不足,则返回error", async () => {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      "Raffle_notEnoughEntranceFee"
                  )
              })
              it("当进入合约时,记录player", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  const contractPlayer = await raffle.getPlayer(0)
                  assert.equal(player.address, contractPlayer)
              })
              it("emit event", async () => {
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee })
                  ).to.emit(raffle, "RaffleEnter")
              })
              it("当raffle处在计算状态时不准进入:", async () => {
                  //测试网上是由chainlink node来checkUpKeep，
                  //hardhat network没有chainlink node,所以我们要模拟
                  // https://hardhat.org/hardhat-network/reference
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber(),
                  ])
                  await network.provider.send("evm_mine", [])
                  //假装keeper
                  await raffle.performUpkeep([])
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee })
                  ).to.be.revertedWith("Raffle_RaffleNotOpen")
              })
          })
          describe("checkUpkeep", function () {
              it("若发送ETH不足则返回false", async () => {
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber(),
                  ])
                  await network.provider.send("evm_mine", [])
                  //现在call checkUpkeep

                  const { upkeepNeeded } = await raffle.checkUpkeep("0x")
                  assert(!upkeepNeeded)
              })
              it("状态如果不是Open, return False", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber(),
                  ])
                  await network.provider.send("evm_mine", [])
                  await raffle.performUpkeep([])
                  const rafflestate = await raffle.getRaffleState()
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep(
                      "0x"
                  )
                  assert.equal(
                      rafflestate.toString() == 1,
                      upkeepNeeded == false
                  )
              })
              it("时间没到, return false", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() - 5,
                  ]) // use a higher number here if this test fails
                  await network.provider.request({
                      method: "evm_mine",
                      params: [],
                  })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep(
                      "0x"
                  ) // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded)
              })
              it("如果有player进入游戏 && 时间到 && Raffle OPEN 状态, return true", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  await network.provider.request({
                      method: "evm_mine",
                      params: [],
                  })
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep(
                      "0x"
                  ) // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upkeepNeeded)
              })
          })
          describe("performUpkeep", function () {
              it("只有checkUpKeep为true才执行", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  await network.provider.request({
                      method: "evm_mine",
                      params: [],
                  })
                  const tx = await raffle.performUpkeep("0x")
                  assert(tx)
              })
              it("reverts if checkUp is false", async () => {
                  await expect(raffle.performUpkeep("0x")).to.be.revertedWith(
                      "Raffle_UpkeepNotNeeded"
                  )
              })
              it("updates the raffle state and emits a requestId", async () => {
                  // Too many asserts in this test!
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  await network.provider.request({
                      method: "evm_mine",
                      params: [],
                  })
                  const txResponse = await raffle.performUpkeep("0x") // emits requestId
                  const txReceipt = await txResponse.wait(1) // waits 1 block
                  const raffleState = await raffle.getRaffleState() // updates state
                  const requestId = txReceipt.events[1].args.requestId
                  assert(requestId.toNumber() > 0)
                  assert(raffleState == 1) // 0 = open, 1 = calculating
              })
          })
          describe("fufillrandomWords", function () {
              beforeEach(async () => {
                console.log(`当前合约余额为:${await raffle.getBalance()}`)
                  await raffle.enterRaffle({ value: raffleEntranceFee })
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ])
                  await network.provider.request({
                      method: "evm_mine",
                      params: [],
                  })
                  //   const accounts = await ethers.getSigners()
                  //   console.log(`accounts有几个:${accounts.length}`)
              })
              it("can only be called after performupkeep", async () => {
                  await expect(
                      vrfCoodrinatorV2Mock.fulfillRandomWords(0, raffle.address) // reverts if not fulfilled
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      vrfCoodrinatorV2Mock.fulfillRandomWords(1, raffle.address) // reverts if not fulfilled
                  ).to.be.revertedWith("nonexistent request")
              })
              it("picks a winner, resets, and sends money", async () => {
                  const additionalEnterances = 8
                  const startingIndex = 1
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingIndex;
                      i < startingIndex + additionalEnterances;
                      i++
                  ) {
                      
                      raffle = raffleContract.connect(accounts[i]) // Returns a new instance of the Raffle contract connected to player
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                      
                      //console.log(`当前签名者为:${raffle.signer.address}`)
                  }

                  console.log(`现在合约余额为:${await raffle.getBalance()}`)

                  const startingTimeStamp = await raffle.getLastTimeStamp()

                  //performUpkeep(mock being chainlink keepers)
                  //fulfillRandomWords(mock being the chainlink VRF)

                  await new Promise(async (resolve, reject) => {
                      //这个raffle.once listener在监听底下的fulfillRandomWords emit WinnerPicked event
                      raffle.once("WinnerPicked", async () => {
                          // event listener for WinnerPicked
                          console.log("WinnerPicked event fired!")
                          // assert throws an error if it fails, so we need to wrap
                          // it in a try/catch so that the promise returns event
                          // if it fails.
                          try {
                              const recentWinner =
                                  await raffle.getRecentWinner()
                              
                              console.log(`游戏玩家0号:${accounts[0].address}`)
                              console.log(`游戏玩家1号:${accounts[1].address}`)
                              console.log(`游戏玩家2号:${accounts[2].address}`)
                              console.log(`游戏玩家3号:${accounts[3].address}`)
                              console.log(`游戏玩家4号:${accounts[4].address}`)
                              console.log(`游戏玩家5号:${accounts[5].address}`)
                              console.log(`游戏玩家6号:${accounts[6].address}`)
                              console.log(`游戏玩家7号:${accounts[7].address}`)
                              console.log(`游戏玩家8号:${accounts[8].address}`)
                              console.log(`游戏玩家9号:${accounts[9].address}`)
                              console.log(`获胜者是:${recentWinner}`)

                              // Now lets get the ending values...

                              const raffleState = await raffle.getRaffleState()
                              const winnerBalance =
                                  await accounts[5].getBalance()
                              
                              const endingTimeStamp =
                                  await raffle.getLastTimeStamp()
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              // Comparisons to check if our ending values are correct:
                              assert.equal(
                                  winnerBalance.toString(),
                                  startbalance.add(
                                      raffleEntranceFee
                                          .mul(additionalEnterances)
                                          .add(raffleEntranceFee)
                                          .toString()
                                  )
                              )
                              assert.equal(raffleState, 0)
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve() // if try passes, resolves the promise
                          } catch (e) {
                              reject(e) // if try fails, rejects the promise
                          }
                      })

                      // kicking off the event by mocking the chainlink keepers and vrf coordinator

                      //mock chainlink keepers

                      const tx = await raffle.performUpkeep([])

                      const txReceipt = await tx.wait(1)
                      const startbalance = await accounts[5].getBalance()
                      console.log(startbalance.toString())
                      //requestId, consumer address
                      //mock coordinator

                      //this function should emit WinnerPicked event
                      await vrfCoodrinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address
                      )
                  })
              })
          })
      })
